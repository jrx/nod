import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import type { ProviderUsageEvent } from '../src/ports/provider-usage.ts';
import { createLedger } from '../src/server/ledger.ts';
import { fakeExecution, fakeWorkspace } from './runtime-fixtures.ts';

test(
  'usage write failures preserve model outcomes and remain strict before new work',
  {
    skip: !process.env.TEST_DATABASE_URL,
    timeout: 30_000,
  },
  async (t) => {
    const schema = `test_ledger_flush_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const pool = new pg.Pool({
      connectionString: process.env.TEST_DATABASE_URL,
      options: `-c search_path=${schema}`,
    });
    let failUsage = false;
    const failedIds = new Set<string>();
    let usageWait: Promise<void> | undefined;
    let usageWaiting = () => {};
    const query = pool.query.bind(pool);
    t.mock.method(pool, 'query', async (sql: string | { text: string }, values?: unknown[]) => {
      if (
        (typeof sql === 'string' ? sql : sql.text).startsWith('INSERT INTO model_usage') &&
        usageWait
      ) {
        usageWaiting();
        await usageWait;
      }
      if (
        (failUsage || failedIds.has(String(values?.[0]))) &&
        (typeof sql === 'string' ? sql : sql.text).startsWith('INSERT INTO model_usage')
      )
        throw new Error('Synthetic usage write timeout.');
      return query(sql, values);
    });
    try {
      await pool.query(
        'CREATE TABLE turns(id uuid PRIMARY KEY,owner_id text NOT NULL); CREATE TABLE preferences(owner_id text PRIMARY KEY,time_zone text,proactive_paused boolean DEFAULT false);',
      );
      await createLedger({ pool, ownerId: 'synthetic-owner' }).initialize();
      await pool.query("INSERT INTO preferences(owner_id) VALUES('synthetic-owner')");
      for (const outcome of ['success', 'failure', 'cancelled'] as const) {
        await t.test(
          `a completed ${outcome} keeps its outcome while usage remains unsaved`,
          async () => {
            const ledger = createLedger({ pool, ownerId: 'synthetic-owner' });
            const usageId = randomUUID();
            const expectedError =
              outcome === 'cancelled'
                ? new DOMException('Synthetic owner Stop.', 'AbortError')
                : new Error('Synthetic provider failure.');
            let calls = 0;
            const base = ledger.agent({
              async open(options) {
                return {
                  resumed: false,
                  abort() {},
                  dispose() {},
                  async prompt() {
                    calls++;
                    options.onEvent({
                      type: 'provider_usage',
                      usage: {
                        id: usageId,
                        provider: 'fixture',
                        model: 'synthetic',
                        category: 'agent',
                        operation: 'request',
                        status:
                          outcome === 'success'
                            ? 'succeeded'
                            : outcome === 'failure'
                              ? 'failed'
                              : 'cancelled',
                        durationMs: 1,
                        costUsd: 0.25,
                        pricing: 'sdk_estimate',
                      },
                    });
                    if (outcome !== 'success') throw expectedError;
                  },
                };
              },
              dispose() {},
            });
            const opened = await base.open({
              ...fakeExecution(randomUUID()),
              systemPrompt: 'Synthetic prompt',
              tools: [],
              workspace: fakeWorkspace().open({
                threadId: randomUUID(),
                workspacePath: '/fixture/workspace',
                signal: new AbortController().signal,
              }),
              runTool: (_name, _params, run) => run(),
              shouldStop: () => false,
              onEvent() {},
            });
            try {
              failUsage = true;
              if (outcome === 'success')
                await assert.doesNotReject(opened.prompt('Synthetic work', []));
              else
                await assert.rejects(
                  opened.prompt('Synthetic work', []),
                  (error) => error === expectedError,
                );
              assert.equal(calls, 1);
              assert.equal(
                (
                  await query('SELECT count(*)::int AS count FROM model_usage WHERE id=$1', [
                    usageId,
                  ])
                ).rows[0].count,
                0,
              );
              await assert.rejects(ledger.reachedLimit(), /Synthetic usage write timeout/);
              await assert.rejects(
                opened.prompt('More synthetic work', []),
                /Synthetic usage write timeout/,
              );
              assert.equal(calls, 1);
              failUsage = false;
              await ledger.flush();
              await ledger.flush();
              const rows = (
                await query('SELECT owner_id,cost_usd,details FROM model_usage WHERE id=$1', [
                  usageId,
                ])
              ).rows;
              assert.equal(rows.length, 1);
              assert.equal(rows[0].owner_id, 'synthetic-owner');
              assert.equal(rows[0].cost_usd, 0.25);
              assert.equal(
                rows[0].details.status,
                outcome === 'success'
                  ? 'succeeded'
                  : outcome === 'failure'
                    ? 'failed'
                    : 'cancelled',
              );
            } finally {
              failUsage = false;
              await ledger.flush();
              await opened.dispose();
            }
          },
        );
      }
      for (const action of ['abort', 'dispose'] as const) {
        await t.test(
          `${action} during usage preflight cannot start a new model request`,
          async () => {
            const ledger = createLedger({ pool, ownerId: 'synthetic-owner' });
            const id = randomUUID();
            let calls = 0;
            let release = () => {};
            const base = ledger.agent({
              async open(options) {
                return {
                  resumed: false,
                  abort() {},
                  dispose() {},
                  async prompt() {
                    calls++;
                    options.onEvent({
                      type: 'provider_usage',
                      usage: {
                        id,
                        provider: 'fixture',
                        model: 'synthetic',
                        category: 'agent',
                        operation: 'request',
                        status: 'succeeded',
                        durationMs: 1,
                        costUsd: 0.2,
                        pricing: 'sdk_estimate',
                      },
                    });
                  },
                };
              },
              dispose() {},
            });
            const opened = await base.open({
              ...fakeExecution(randomUUID()),
              systemPrompt: 'Synthetic prompt',
              tools: [],
              workspace: fakeWorkspace().open({
                threadId: randomUUID(),
                workspacePath: '/fixture/workspace',
                signal: new AbortController().signal,
              }),
              runTool: (_name, _params, run) => run(),
              shouldStop: () => false,
              onEvent() {},
            });
            try {
              failUsage = true;
              await opened.prompt('First synthetic request', []);
              failUsage = false;
              const entered = new Promise<void>((resolve) => {
                usageWaiting = resolve;
              });
              usageWait = new Promise<void>((resolve) => {
                release = resolve;
              });
              const waiting = opened.prompt('Must not start after Stop', []);
              await entered;
              await opened[action]();
              release();
              await assert.rejects(
                waiting,
                (error) => error instanceof Error && error.name === 'AbortError',
              );
              assert.equal(calls, 1);
              assert.equal(
                (await query('SELECT count(*)::int AS count FROM model_usage WHERE id=$1', [id]))
                  .rows[0].count,
                1,
              );
            } finally {
              release();
              usageWait = undefined;
              usageWaiting = () => {};
              failUsage = false;
              await ledger.flush();
              await opened.dispose();
            }
          },
        );
      }
      for (const kind of ['curator', 'decision', 'speech', 'transcription'] as const) {
        for (const failed of [false, true]) {
          await t.test(
            `${kind} preserves ${failed ? 'its original error' : 'its completed result'} and blocks new charges`,
            async () => {
              const ledger = createLedger({ pool, ownerId: 'synthetic-owner' });
              const id = randomUUID();
              const original = new Error('Synthetic original provider error.');
              let calls = 0;
              const complete = (
                report?: (usage: ProviderUsageEvent & { model: string; costUsd: number }) => void,
              ) => {
                calls++;
                report?.({
                  id,
                  provider: 'fixture',
                  model: 'synthetic',
                  category: 'agent',
                  operation: 'request',
                  status: failed ? 'failed' : 'succeeded',
                  durationMs: 1,
                  costUsd: 0.25,
                  pricing: 'sdk_estimate',
                });
                if (failed) throw original;
              };
              const result = { complete: true };
              const audio = {
                bytes: Buffer.from('synthetic'),
                mimeType: 'audio/wav',
                fileName: 'synthetic.wav',
              };
              let run: () => Promise<unknown>;
              let expected: unknown = result;
              if (kind === 'curator') {
                const wrapped = ledger.curator({
                  id: 'fixture',
                  configured: true,
                  async curate(_request, _signal, report) {
                    complete(report);
                    return result;
                  },
                });
                run = () =>
                  wrapped.curate({ task: 'review', instructions: 'Synthetic review', input: {} });
              } else if (kind === 'decision') {
                const wrapped = ledger.decisions({
                  configured: true,
                  async check(_request, _signal, report) {
                    complete(report);
                    return result;
                  },
                });
                run = () =>
                  wrapped.check({
                    instructions: 'Synthetic decision',
                    input: {},
                    question: {
                      name: 'synthetic',
                      choices: [{ value: true, description: 'Synthetic choice' }],
                    },
                  });
              } else {
                const wrapped = ledger.speech({
                  id: 'fixture',
                  configured: true,
                  async synthesize(_text, _signal, report) {
                    complete(report);
                    return audio;
                  },
                  async transcribe(_audio, _signal, report) {
                    complete(report);
                    return 'Synthetic transcript';
                  },
                });
                if (kind === 'speech') {
                  expected = audio;
                  run = () => wrapped.synthesize('Synthetic text');
                } else {
                  expected = 'Synthetic transcript';
                  run = () =>
                    wrapped.transcribe!({
                      bytes: new Uint8Array(),
                      mimeType: 'audio/wav',
                      name: 'synthetic.wav',
                    });
                }
              }
              try {
                failUsage = true;
                if (failed) await assert.rejects(run(), (error) => error === original);
                else assert.equal(await run(), expected);
                await assert.rejects(run(), /Synthetic usage write timeout/);
                await assert.rejects(
                  ledger.withTurn(randomUUID(), run, true, false),
                  /Synthetic usage write timeout/,
                );
                await assert.rejects(ledger.reserve(0.25), /Synthetic usage write timeout/);
                assert.equal(calls, 1);
                failUsage = false;
                await Promise.all([ledger.flush(), ledger.flush()]);
                assert.equal(
                  (await query('SELECT count(*)::int AS count FROM model_usage WHERE id=$1', [id]))
                    .rows[0].count,
                  1,
                );
              } finally {
                failUsage = false;
                await ledger.flush();
              }
            },
          );
        }
      }
      await t.test(
        'closed preparation keeps its reservation until every pending charge is saved',
        async () => {
          const ledger = createLedger({ pool, ownerId: 'synthetic-owner' });
          const scope = randomUUID();
          const ids = [randomUUID(), randomUUID()];
          const wrapped = ledger.curator({
            id: 'fixture',
            configured: true,
            async curate(_request, _signal, report) {
              for (const id of ids) report?.({ id, model: 'synthetic', costUsd: 0.2 });
              return 'Synthetic completed preparation';
            },
          });
          try {
            const result = await ledger.withPreparation(scope, async () => {
              const settle = await ledger.reserve(0.4);
              failUsage = true;
              const value = await wrapped.curate({
                task: 'review',
                instructions: 'Synthetic review',
                input: {},
              });
              await settle(0.4);
              return value;
            });
            assert.equal(result, 'Synthetic completed preparation');
            assert.equal(
              (
                await query(
                  'SELECT count(*)::int AS count FROM preparation_reservations WHERE id=$1',
                  [scope],
                )
              ).rows[0].count,
              1,
            );
            failUsage = false;
            failedIds.add(ids[1]);
            await assert.rejects(ledger.flush(), /Synthetic usage write timeout/);
            assert.equal(
              (
                await query(
                  'SELECT count(*)::int AS count FROM model_usage WHERE id=ANY($1::text[])',
                  [ids],
                )
              ).rows[0].count,
              1,
            );
            assert.equal(
              (
                await query(
                  'SELECT count(*)::int AS count FROM preparation_reservations WHERE id=$1',
                  [scope],
                )
              ).rows[0].count,
              1,
            );
            failedIds.clear();
            await Promise.all([ledger.flush(), ledger.flush()]);
            assert.equal(
              (
                await query(
                  'SELECT count(*)::int AS count,sum(cost_usd)::float8 AS cost FROM model_usage WHERE id=ANY($1::text[])',
                  [ids],
                )
              ).rows[0].cost,
              0.4,
            );
            assert.equal(
              (
                await query(
                  'SELECT count(*)::int AS count FROM preparation_reservations WHERE id=$1',
                  [scope],
                )
              ).rows[0].count,
              0,
            );
          } finally {
            failUsage = false;
            failedIds.clear();
            await ledger.flush();
          }
        },
      );
      await t.test(
        'Stop keeps its original error and retains a closed preparation charge',
        async () => {
          const ledger = createLedger({ pool, ownerId: 'synthetic-owner' });
          const scope = randomUUID();
          const original = new DOMException('Synthetic owner Stop.', 'AbortError');
          const wrapped = ledger.curator({
            id: 'fixture',
            configured: true,
            async curate(_request, _signal, report) {
              report?.({ id: randomUUID(), model: 'synthetic', costUsd: 0.2 });
              return {};
            },
          });
          try {
            await assert.rejects(
              ledger.withPreparation(scope, async () => {
                const settle = await ledger.reserve(0.2);
                failUsage = true;
                await wrapped.curate({
                  task: 'review',
                  instructions: 'Synthetic review',
                  input: {},
                });
                await settle(0.2);
                throw original;
              }),
              (error) => error === original,
            );
            assert.equal(
              (
                await query(
                  'SELECT count(*)::int AS count FROM preparation_reservations WHERE id=$1',
                  [scope],
                )
              ).rows[0].count,
              1,
            );
            failUsage = false;
            await ledger.flush();
            assert.equal(
              (
                await query(
                  'SELECT count(*)::int AS count FROM preparation_reservations WHERE id=$1',
                  [scope],
                )
              ).rows[0].count,
              0,
            );
          } finally {
            failUsage = false;
            await ledger.flush();
          }
        },
      );
      await t.test(
        'the monthly amount can be bypassed without bypassing usage persistence',
        async () => {
          const ledger = createLedger({ pool, ownerId: 'synthetic-owner' });
          let calls = 0;
          const wrapped = ledger.curator({
            id: 'fixture',
            configured: true,
            async curate(_request, _signal, report) {
              calls++;
              report?.({ id: randomUUID(), model: 'synthetic', costUsd: 0.2 });
              return 'Synthetic owner reply';
            },
          });
          const run = () =>
            wrapped.curate({ task: 'review', instructions: 'Synthetic review', input: {} });
          try {
            await ledger.setLimits({ monthlyUsd: 1 });
            await assert.rejects(run(), /spending limit is reached/);
            assert.equal(calls, 0);
            assert.equal(
              await ledger.withTurn(randomUUID(), run, true, false),
              'Synthetic owner reply',
            );
            assert.equal(calls, 1);
          } finally {
            await ledger.setLimits({ monthlyUsd: null });
          }
        },
      );
      await t.test('flushing usage cannot release an open preparation reservation', async () => {
        const ledger = createLedger({ pool, ownerId: 'synthetic-owner' });
        const scope = randomUUID();
        let ready = () => {};
        let finish = () => {};
        const opened = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const held = new Promise<void>((resolve) => {
          finish = resolve;
        });
        const wrapped = ledger.curator({
          id: 'fixture',
          configured: true,
          async curate(_request, _signal, report) {
            report?.({ id: randomUUID(), model: 'synthetic', costUsd: 0.2 });
            return {};
          },
        });
        const work = ledger.withPreparation(scope, async () => {
          const settle = await ledger.reserve(0.2);
          await wrapped.curate({ task: 'review', instructions: 'Synthetic review', input: {} });
          await settle(0.2);
          ready();
          await held;
        });
        try {
          await opened;
          await ledger.flush();
          assert.equal(
            (
              await query(
                'SELECT count(*)::int AS count FROM preparation_reservations WHERE id=$1',
                [scope],
              )
            ).rows[0].count,
            1,
          );
        } finally {
          finish();
          await work;
        }
        assert.equal(
          (
            await query('SELECT count(*)::int AS count FROM preparation_reservations WHERE id=$1', [
              scope,
            ])
          ).rows[0].count,
          0,
        );
      });
    } finally {
      failUsage = false;
      await pool.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
