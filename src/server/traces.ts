import { createHash, createHmac, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ModelTrace, ModelTraceDelivery, ModelTraces } from '../ports/traces.ts';
import { analyticsVersion } from './analytics-events.ts';
import {
  createPersonalDataRedactor,
  withoutPersonalFields,
  type PersonalProfile,
} from './personal-data.ts';
import { createTextRedactor, withoutSecretKeys } from './redaction.ts';

const cacheLimit = 4096;
const identifiers = new Set(['turn_id', 'run_id', 'parent_run_id']);
const uuids = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const home = homedir();
const homes = home.length > 1 ? [home, JSON.stringify(home).slice(1, -1)] : [];

function structured(value: string, text: (value: string) => string) {
  const trimmed = value.trim();
  if (!/^[[{]/.test(trimmed)) return text(value);
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return text(value);
  }
  return JSON.stringify(withoutPersonalFields(withoutSecretKeys(parsed), text));
}

export function createModelTraces(deliver?: ModelTraceDelivery, appVersion?: string) {
  const version = analyticsVersion.safeParse(appVersion).data;
  let enabled = false;
  let userId: string | undefined;
  let conversationKey: Uint8Array = randomBytes(32);
  const turns = new AsyncLocalStorage<{
    sessionId: string;
    turnId: string;
    ids: { thread_id: string; turn_id: string };
  }>();
  let secrets: string[] = [];
  let secretText = createTextRedactor(secrets);
  let profile: () => Promise<PersonalProfile> = async () => ({ names: [] });
  let loaded: { profile: string; text: (value: string) => string } | undefined;
  let seen = -1;
  const cache = new Map<string, string>();
  let stopping = new AbortController();
  const salt = randomBytes(32);
  const pseudonym = (value: string) =>
    createHmac('sha256', salt)
      .update(`${new Date().toISOString().slice(0, 10)}:${value}`)
      .digest('hex')
      .slice(0, 32);

  const conversation = (session: string) =>
    createHmac('sha256', conversationKey)
      .update(`nod:trace:conversation:v1:${session}`)
      .digest('hex')
      .slice(0, 32);

  async function scrubber() {
    const current = await profile();
    const key = JSON.stringify(current);
    if (loaded?.profile !== key) {
      const personal = createPersonalDataRedactor(current);
      loaded = {
        profile: key,
        text: (value) =>
          personal(secretText(homes.reduce((text, path) => text.replaceAll(path, '~'), value))),
      };
      cache.clear();
    }
    if (seen !== secrets.length) {
      seen = secrets.length;
      cache.clear();
    }
    const text = loaded.text;
    return (value: string) => {
      const key = createHash('sha256').update(value).digest('base64');
      let safe = cache.get(key);
      if (safe === undefined) {
        if (cache.size >= cacheLimit) cache.clear();
        cache.set(key, (safe = structured(value, text)));
      }
      return safe.replace(uuids, (id) => pseudonym(id.toLowerCase()));
    };
  }

  async function send(trace: ModelTrace, ids: { thread_id: string; turn_id: string }) {
    const signal = stopping.signal;
    const identity = userId;
    const text = await scrubber();
    const scrub = (value: unknown) =>
      JSON.parse(
        JSON.stringify(withoutSecretKeys(value), (_key, item) =>
          typeof item === 'string' ? text(item) : item,
        ),
      );
    if (!enabled || !deliver || signal.aborted) return;
    await deliver(
      {
        ...trace,
        name: scrub(trace.name) || '[redacted]',
        provider: scrub(trace.provider) || '[redacted]',
        tools: trace.tools.map((tool) => scrub(tool) || '[redacted]'),
        messages: scrub(trace.messages),
        output: scrub(trace.output),
        ...(trace.error ? { error: text(trace.error) } : {}),
        metadata: {
          ...Object.fromEntries(
            Object.entries(trace.metadata).flatMap(([key, value]) =>
              key === 'session_id' || key === 'user_id'
                ? []
                : [[key, identifiers.has(key) ? pseudonym(String(value)) : value]],
            ),
          ),
          ...ids,
          ...(identity ? { user_id: identity } : {}),
          ...(trace.usage.costUsd === null ? {} : { cost_usd: trace.usage.costUsd }),
          ...(version ? { app_version: version } : {}),
        },
      },
      signal,
    );
  }

  return {
    configure(options: {
      enabled?: boolean;
      secrets?: string[];
      profile?: () => Promise<PersonalProfile>;
      userId?: string;
      conversationKey?: Uint8Array;
    }) {
      if (options.conversationKey) {
        if (options.conversationKey.byteLength !== 32)
          throw new Error('The trace conversation key must contain 32 bytes.');
        conversationKey = Buffer.from(options.conversationKey);
      }
      if ('userId' in options)
        userId =
          typeof options.userId === 'string' &&
          /^local:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
            options.userId,
          )
            ? options.userId
            : undefined;
      if (options.enabled !== undefined) enabled = options.enabled;
      if (!enabled) {
        cache.clear();
        stopping.abort();
        stopping = new AbortController();
      }
      if (options.secrets) {
        secrets = options.secrets;
        secretText = createTextRedactor(secrets);
        loaded = undefined;
      }
      if (options.profile) {
        profile = options.profile;
        loaded = undefined;
      }
    },
    available: deliver !== undefined,
    active: () => enabled && deliver !== undefined,
    withTurn<T>(
      context: { sessionId: string; turnId: string },
      run: (ids: { thread_id: string; turn_id: string }) => T,
    ): T {
      const ids = {
        thread_id: conversation(context.sessionId),
        turn_id: pseudonym(context.turnId),
      };
      return turns.run({ ...context, ids }, () => run(ids));
    },
    record(trace: ModelTrace) {
      if (!enabled || !deliver) return;
      const turn = turns.getStore();
      const metadata = {
        ...trace.metadata,
        ...(turn ? { session_id: turn.sessionId, turn_id: turn.turnId } : {}),
      };
      const turnId = String(metadata.turn_id ?? trace.id);
      const thread = conversation(String(metadata.session_id ?? turnId));
      void send(
        { ...trace, metadata },
        turn?.ids ?? { thread_id: thread, turn_id: pseudonym(turnId) },
      ).catch(() => {});
    },
  } satisfies ModelTraces & Record<string, unknown>;
}

export type ModelTraceGate = ReturnType<typeof createModelTraces>;
