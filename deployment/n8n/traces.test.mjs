import assert from 'node:assert/strict';
import { test } from 'node:test';
import { admitTrace, checkTrace, tracesWorkflow, tracesWorkflowDefinition } from './traces.mjs';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const trace = (changes = {}) => ({
  version: 1,
  run: {
    id,
    name: 'fixture-model',
    provider: 'fixture',
    start_time: '2026-10-19T10:00:00.000Z',
    end_time: '2026-10-19T10:00:01.000Z',
    inputs: { messages: [{ role: 'user', content: 'Synthetic question' }], tools: ['web_search'] },
    outputs: { role: 'assistant', content: 'Synthetic answer' },
    usage: {
      input_tokens: 10,
      output_tokens: 2,
      total_tokens: 12,
      input_token_details: { cache_read: 4, cache_creation: 0 },
      total_cost: 0.001,
    },
    metadata: { source: 'agent', session_id: 'fixture-session' },
    ...changes,
  },
});

test('valid traces become one llm run pinned to the Nod project with usage for cost tracking', () => {
  const run = (code) => new Function('$input', '$getWorkflowStaticData', '$now', code);
  const validate = tracesWorkflowDefinition().nodes.find((node) => node.name === 'Validate trace');
  const [{ json }] = run(validate.parameters.jsCode)(
    {
      first: () => ({
        json: {
          body: trace({ session_name: 'instance-ai', parent_run_id: id, error: 'Synthetic' }),
        },
      }),
    },
    () => ({}),
    { toMillis: () => Date.UTC(2026, 9, 19, 10, 0) },
  );
  assert.equal(json.ok, true);
  const sent = trace().run;
  for (const field of ['id', 'name', 'start_time', 'end_time', 'outputs'])
    assert.deepEqual(json.run[field], sent[field], field);
  assert.deepEqual(json.run.inputs, sent.inputs);
  assert.equal(json.run.error, 'Synthetic');
  assert.equal(json.run.session_id, tracesWorkflow.langsmithProjectId);
  assert.equal(json.run.run_type, 'llm');
  assert.equal(json.run.parent_run_id, undefined);
  assert.deepEqual(json.run.extra.metadata, {
    source: 'agent',
    session_id: 'fixture-session',
    ls_provider: 'fixture',
    ls_model_name: 'fixture-model',
    usage_metadata: {
      input_tokens: 10,
      output_tokens: 2,
      total_tokens: 12,
      input_token_details: { cache_read: 4, cache_creation: 0 },
      total_cost: 0.001,
    },
  });
});

test('the broker forwards at most its per-minute limit across all senders', () => {
  const state = {};
  const minute = Date.UTC(2026, 9, 19, 10, 0);
  for (let index = 0; index < tracesWorkflow.perMinute; index++)
    assert.equal(admitTrace(state, minute + index, tracesWorkflow.perMinute), true);
  assert.equal(admitTrace(state, minute + 59_000, tracesWorkflow.perMinute), false);
  assert.equal(admitTrace(state, minute + 60_000, tracesWorkflow.perMinute), true);
  const validate = tracesWorkflowDefinition().nodes.find((node) => node.name === 'Validate trace');
  const full = { minute: Math.floor(minute / 60_000), count: tracesWorkflow.perMinute };
  const [{ json }] = new Function(
    '$input',
    '$getWorkflowStaticData',
    '$now',
    validate.parameters.jsCode,
  )({ first: () => ({ json: { body: trace() } }) }, () => full, {
    toMillis: () => minute + 30_000,
  });
  assert.equal(json.ok, false);
});

test('the broker keeps trace join IDs, error types and numeric known costs', () => {
  for (const source of ['agent', 'curator'])
    for (const cost of [0, 0.03]) {
      const metadata = {
        source,
        user_id: `local:${id}`,
        thread_id: 'a'.repeat(32),
        turn_id: 'b'.repeat(32),
        cost_usd: cost,
        error_type: 'quota',
      };
      const result = checkTrace(trace({ metadata, error: 'Synthetic quota exceeded.' }), 'nod');
      assert.equal(result.ok, true);
      for (const [key, value] of Object.entries(metadata))
        assert.equal(result.run.extra.metadata[key], value);
      assert.equal(result.run.error, 'Synthetic quota exceeded.');
    }
  for (const cost_usd of [-1, NaN, Infinity, '0.03', null])
    assert.equal(checkTrace(trace({ metadata: { cost_usd } }), 'nod').ok, false);
});

test(
  'the largest producer metadata survives delivery and the broker enforces the 20-key boundary',
  { timeout: 5000 },
  async () => {
    const { createModelTraces } = await import('../../src/server/traces.ts');
    const { createN8nTraces } = await import('../../src/providers/n8n/traces.ts');
    const { piModelTrace } = await import('../../src/providers/pi/traces.ts');
    const { fauxAssistantMessage } = await import('@earendil-works/pi-ai/providers/faux');
    for (const userId of [undefined, `local:${id}`]) {
      let receive;
      const delivered = new Promise((resolve) => {
        receive = resolve;
      });
      const traces = createModelTraces(
        createN8nTraces({
          url: 'https://traces.example.test/',
          token: 'synthetic-trace-token',
          request: async (_url, request) => {
            receive(JSON.parse(String(request.body)));
            return new Response(null, { status: 202 });
          },
        }),
        '0.9.0',
      );
      traces.configure({ enabled: true, userId });
      const message = fauxAssistantMessage('Synthetic answer.');
      traces.record(
        piModelTrace(
          {
            model: { id: 'fixture-model', provider: 'fixture' },
            context: { messages: [] },
            message: {
              ...message,
              stopReason: 'error',
              errorMessage: 'Synthetic refusal. (HTTP 503)',
              usage: {
                input: 10,
                output: 2,
                cacheRead: 1,
                cacheWrite: 1,
                totalTokens: 14,
                cost: { input: 0.01, output: 0.02, cacheRead: 0.01, cacheWrite: 0.01, total: 0.05 },
              },
            },
            startedAt: new Date().toISOString(),
            request: { requestPhase: 'response', requestKind: 'regular' },
          },
          {
            source: 'agent',
            session_id: id,
            turn_id: id,
            run_id: id,
            parent_run_id: id,
            task: 'plan',
          },
        ),
      );
      const payload = await delivered;
      assert.equal(traces.active(), true);
      assert.equal(checkTrace(payload, 'nod').ok, true);
      assert.equal(payload.run.metadata.user_id, userId);
      assert.equal(payload.run.metadata.error_type, 'provider_unavailable');
      assert.equal(payload.run.metadata.cost_usd, 0.05);
      const metadata = payload.run.metadata;
      const names = 'abcdefghijklmnopqrst';
      for (let index = 0; Object.keys(metadata).length < 20; index++)
        metadata[`reserved_${names[index]}`] = 'synthetic';
      assert.equal(checkTrace(payload, 'nod').ok, true);
      metadata.over_limit = 'synthetic';
      assert.equal(checkTrace(payload, 'nod').ok, false);
    }
  },
);

test('malformed or oversized traces never reach LangSmith', () => {
  for (const changes of [
    { id: 'not-a-uuid' },
    { name: '' },
    { start_time: 'yesterday' },
    { end_time: '2026-10-19T09:59:59.000Z' },
    { inputs: { messages: 'Synthetic question', tools: [] } },
    { outputs: 'Synthetic answer' },
    { error: 42 },
    { usage: { input_tokens: -1, output_tokens: 2, total_tokens: 1 } },
    { metadata: { 'Session-Id': 'fixture-session' } },
    { metadata: { session_id: { nested: true } } },
    { inputs: { messages: ['x'.repeat(8 * 1024 * 1024)], tools: [] } },
    { inputs: { messages: ['界'.repeat(3 * 1024 * 1024)], tools: [] } },
  ])
    assert.equal(checkTrace(trace(changes), 'nod').ok, false, JSON.stringify(changes).slice(0, 80));
  assert.equal(checkTrace({ ...trace(), version: 2 }, 'nod').ok, false);
});

test('the broker requires the Nod token, keeps no execution data and sends only through its LangSmith credential', () => {
  const definition = tracesWorkflowDefinition({
    webhook: { id: 'fixture-webhook', name: 'Webhook fixture' },
    langsmith: { id: 'fixture-credential', name: 'Fixture' },
  });
  const receive = definition.nodes.find((node) => node.name === 'Receive trace');
  assert.equal(receive.parameters.authentication, 'headerAuth');
  assert.deepEqual(receive.credentials, {
    httpHeaderAuth: { id: 'fixture-webhook', name: 'Webhook fixture' },
  });
  assert.equal(definition.settings.saveDataSuccessExecution, 'none');
  assert.equal(definition.settings.saveDataErrorExecution, 'none');
  assert.equal(definition.settings.saveManualExecutions, false);
  assert.deepEqual(definition.connections['Valid trace?'].main, [
    [{ node: 'Send to LangSmith', type: 'main', index: 0 }],
    [],
  ]);
  const send = definition.nodes.find((node) => node.name === 'Send to LangSmith');
  assert.equal(send.parameters.jsonBody, '={{ $json.run }}');
  assert.equal(send.parameters.url, 'https://eu.api.smith.langchain.com/runs');
  assert.equal(send.parameters.genericAuthType, 'httpHeaderAuth');
  assert.deepEqual(send.credentials, {
    httpHeaderAuth: { id: 'fixture-credential', name: 'Fixture' },
  });
  assert.equal(send.parameters.options.redirect.redirect.followRedirects, false);
});
