import { randomUUID } from 'node:crypto';
import type { DesktopControl } from '../ports/desktop.ts';
import { parentRequests } from './parent-port.ts';

const answerMs = 120_000;
const startMs = 85_000;

export function desktopControl(): DesktopControl | undefined {
  const request = parentRequests(
    'nod-computer',
    answerMs,
    'The computer use helper did not answer within 2 minutes.',
  );
  if (!request) return undefined;
  return {
    request: async (input, signal) => {
      const step = randomUUID();
      const cancel = () => void request({ request: { op: 'cancel', step } }).catch(() => {});
      signal?.addEventListener('abort', cancel, { once: true });
      try {
        return ((
          await request(
            {
              request:
                input.op === 'cancel' ? input : { ...input, step, deadline: Date.now() + startMs },
            },
            signal,
          )
        ).result ?? {}) as Record<string, unknown>;
      } catch (error) {
        if (!signal?.aborted) cancel();
        throw error;
      } finally {
        signal?.removeEventListener('abort', cancel);
      }
    },
  };
}
