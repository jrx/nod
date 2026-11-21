import assert from 'node:assert/strict';
import { Compile } from 'typebox/compile';
import { bundledApps, type BundledApp } from '../src/server/app-catalog.ts';
import { createDiscoveredTransport } from '../src/providers/discovered/remote.ts';
import { createSkillLibrary } from '../src/providers/pi/skills.ts';
import { coreSkills } from '../src/runtime/prompt.ts';
import { fileURLToPath } from 'node:url';
import { posix } from 'node:path';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { runProcess } from '../src/providers/process.ts';
import { appRequestUrl, appRequestHeaders } from '../src/server/app-requests.ts';
import { join } from 'node:path';
import { appSchemaDirectory, appSchemaFiles } from './app-schemas.ts';
import { Meta } from 'typebox/schema';

const schemaCheck = Compile(Meta['https://json-schema.org/draft/2020-12/schema']);

export async function checkAppContract(app: BundledApp) {
  if (app.kind === 'http') return checkHttpContract(app);
  if (app.kind === 'cli') return checkCliContract(app);
  const { contract } = app;
  const schema = contract.tool.inputSchema;
  assert.equal(schema.type, 'object', `${app.slug}: the read tool needs an object input schema.`);
  assert(
    schemaCheck.Check(schema),
    `${app.slug}: the tool schema is not valid JSON Schema 2020-12.`,
  );
  assert(
    Compile(schema as Parameters<typeof Compile>[0]).Check(contract.input),
    `${app.slug}: the sample input does not match the tool schema.`,
  );
  const endpoint = app.endpoint ?? `https://instance.example.test${app.instancePath}`;
  const credential = 'synthetic-app-contract-token';
  const headers: Record<string, string> =
    app.auth === 'x-api-key'
      ? { 'X-API-Key': credential }
      : { Authorization: `Bearer ${credential}` };
  let failure: 'tool' | 'permission' | 'rate' | undefined;
  let calls = 0;
  const transport = createDiscoveredTransport(
    async (input, init) => {
      const request = new Request(input, init);
      assert.equal(request.url, endpoint, `${app.slug}: a request left the configured endpoint.`);
      assert.equal(
        request.headers.get(app.auth === 'x-api-key' ? 'x-api-key' : 'authorization'),
        app.auth === 'x-api-key' ? credential : `Bearer ${credential}`,
      );
      if (request.method === 'GET') return new Response(null, { status: 405 });
      if (request.method === 'DELETE') return new Response(null, { status: 200 });
      const message = JSON.parse(await request.text());
      if (message.id === undefined) return new Response(null, { status: 202 });
      if (message.method === 'tools/call') {
        calls++;
        assert.equal(message.params.name, contract.tool.name);
        assert.deepEqual(message.params.arguments, contract.input);
        if (failure === 'permission' || failure === 'rate')
          return Response.json(
            {
              error:
                failure === 'permission' ? 'synthetic_permission_denied' : 'synthetic_rate_limit',
            },
            { status: failure === 'permission' ? 403 : 429 },
          );
      }
      let result;
      if (message.method === 'initialize')
        result = {
          protocolVersion: message.params.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: `synthetic-${app.slug}`, version: '1.0.0' },
        };
      else if (message.method === 'tools/list') result = { tools: [contract.tool] };
      else {
        assert.equal(message.method, 'tools/call');
        result =
          failure === 'tool'
            ? { isError: true, content: [{ type: 'text', text: 'synthetic_record_unavailable' }] }
            : { content: [{ type: 'text', text: JSON.stringify(contract.output) }] };
      }
      return Response.json({ jsonrpc: '2.0', id: message.id, result });
    },
    async (value) => {
      assert.equal(value, endpoint);
      return value;
    },
  );
  const listed = await transport.listTools(endpoint, headers);
  assert(
    listed.tools.some((tool) => tool.name === contract.tool.name),
    `${app.slug}: the read tool was not discovered.`,
  );
  const result = (await transport.callTool(
    endpoint,
    headers,
    contract.tool.name,
    contract.input,
  )) as { content: Array<{ text: string }> };
  assert.deepEqual(JSON.parse(result.content[0].text), contract.output);
  for (const mode of ['tool', 'permission', 'rate'] as const) {
    failure = mode;
    const before = calls;
    await assert.rejects(
      transport.callTool(endpoint, headers, contract.tool.name, contract.input),
      mode === 'tool'
        ? /synthetic_record_unavailable/
        : mode === 'permission'
          ? /synthetic_permission_denied/
          : /synthetic_rate_limit/,
    );
    assert.equal(calls, before + 1, `${app.slug}: a failed call was sent more than once.`);
  }
  const stopped = new AbortController();
  stopped.abort(new Error('synthetic_stop'));
  const before = calls;
  await assert.rejects(
    transport.callTool(endpoint, headers, contract.tool.name, contract.input, stopped.signal),
    /synthetic_stop/,
  );
  assert.equal(calls, before, `${app.slug}: a stopped call reached the provider.`);
}

async function checkHttpContract(app: Extract<BundledApp, { kind: 'http' }>) {
  const { contract } = app;
  const endpoint = appRequestUrl(app.endpoint, contract.request.path);
  const credential = 'synthetic-app-contract-token';
  const headers = appRequestHeaders(app, credential);
  let status = 200;
  let calls = 0;
  const transport = createDiscoveredTransport(
    async (input, init) => {
      const request = new Request(input, init);
      calls++;
      assert.equal(request.url, endpoint, `${app.slug}: the read left the saved API address.`);
      assert.equal(request.method, contract.request.method);
      assert.equal(
        request.headers.get(
          app.auth === 'x-api-key' ? (app.apiKeyHeader ?? 'X-API-Key') : 'Authorization',
        ),
        app.auth === 'x-api-key' ? credential : `Bearer ${credential}`,
      );
      assert.deepEqual(
        await request.text(),
        contract.request.method === 'POST' ? JSON.stringify(contract.request.body) : '',
      );
      return Response.json(
        status === 200
          ? contract.output
          : { error: status === 403 ? 'synthetic_permission_denied' : 'synthetic_rate_limit' },
        { status },
      );
    },
    async (value) => value,
  );
  const read = (signal?: AbortSignal) =>
    transport.http(
      endpoint,
      headers,
      contract.request.method,
      contract.request.method === 'POST' ? contract.request.body : undefined,
      signal,
    );
  const result = await read();
  assert('body' in result);
  assert.deepEqual(result.body, contract.output);
  for (const failure of [403, 429]) {
    status = failure;
    const before = calls;
    await assert.rejects(
      read(),
      failure === 403 ? /synthetic_permission_denied/ : /synthetic_rate_limit/,
    );
    assert.equal(calls, before + 1, `${app.slug}: the failed API read was sent more than once.`);
  }
  const stopped = new AbortController();
  stopped.abort(new Error('synthetic_stop'));
  const before = calls;
  await assert.rejects(read(stopped.signal), /synthetic_stop/);
  assert.equal(calls, before, `${app.slug}: a stopped API read reached the provider.`);
}

async function checkCliContract(app: Extract<BundledApp, { kind: 'cli' }>) {
  const { contract } = app;
  const directory = await mkdtemp(join(tmpdir(), 'nod-app-cli-check-'));
  try {
    const launches = join(directory, 'launches');
    const environment = Object.fromEntries(
      Object.keys(app.environment).map((name) => [name, `synthetic-${name.toLowerCase()}`]),
    );
    const program = `import assert from 'node:assert/strict';
import { readFileSync, appendFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync(0, 'utf8'));
appendFileSync(fixture.launches, 'x');
assert.deepEqual(process.argv.slice(1), fixture.argv);
for (const [name, value] of Object.entries(fixture.environment)) assert.equal(process.env[name], value);
if (fixture.status) { process.stderr.write(fixture.status === 86 ? 'synthetic_permission_denied' : 'synthetic_rate_limit'); process.exit(fixture.status); }
process.stdout.write(fixture.format === 'json' ? JSON.stringify(fixture.output) : fixture.output);`;
    const read = (status: number, signal?: AbortSignal) =>
      runProcess(
        process.execPath,
        ['--input-type=module', '--eval', program, '--', ...contract.argv],
        {
          env: environment,
          input: JSON.stringify({
            launches,
            argv: contract.argv,
            environment,
            status,
            format: contract.format,
            output: contract.output,
          }),
          signal,
          timeoutMs: contract.timeoutSeconds * 1000,
        },
      );
    const result = await read(0);
    assert.equal(result.exitCode, 0, result.stderr);
    assert.deepEqual(
      contract.format === 'json' ? JSON.parse(result.stdout) : result.stdout,
      contract.output,
    );
    for (const status of [86, 87]) {
      const failed = await read(status);
      assert.equal(failed.exitCode, status);
      assert.match(
        failed.stderr,
        status === 86 ? /synthetic_permission_denied/ : /synthetic_rate_limit/,
      );
    }
    assert.equal(
      await readFile(launches, 'utf8'),
      'xxx',
      `${app.slug}: a failed command was sent more than once.`,
    );
    const stopped = new AbortController();
    stopped.abort(new Error('synthetic_stop'));
    await assert.rejects(async () => read(0, stopped.signal), /synthetic_stop/);
    assert.equal(
      await readFile(launches, 'utf8'),
      'xxx',
      `${app.slug}: a stopped command reached the provider.`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  for (const [name, schema] of Object.entries(appSchemaFiles))
    assert.deepEqual(
      JSON.parse(readFileSync(join(appSchemaDirectory, name), 'utf8')),
      schema,
      `The ${name} schema changed. Run pnpm generate:app-schemas.`,
    );
  const selected = process.argv[2];
  const apps = selected ? [bundledApps.get(selected)] : [...bundledApps.values()];
  if (apps.some((app) => !app)) throw new Error(`App ${selected} was not found.`);
  const library = createSkillLibrary(
    [
      fileURLToPath(new URL('../src/runtime/skills/', import.meta.url)),
      ...[...bundledApps.values()].flatMap((app) => (app.skills ? [app.skills] : [])),
    ],
    coreSkills,
  );
  for (const name of [...coreSkills, ...library.catalog.map((skill) => skill.name)]) {
    const pending = ['SKILL.md'];
    const checked = new Set<string>();
    while (pending.length) {
      const path = pending.pop()!;
      if (checked.has(path)) continue;
      checked.add(path);
      const { content } = library.read(name, path);
      for (const match of content.matchAll(/\[[^\]]*\]\(([^)\s]+\.md(?:#[^)\s]*)?)\)/g)) {
        if (/^[a-z]+:|^\//i.test(match[1])) continue;
        pending.push(posix.join(posix.dirname(path), decodeURIComponent(match[1].split('#')[0])));
      }
    }
  }
  for (const app of apps as BundledApp[]) {
    await checkAppContract(app);
    console.log(`${app.slug}: format, read, authentication, errors, rate limit, and Stop passed.`);
  }
}
