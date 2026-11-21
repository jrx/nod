import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isIP } from 'node:net';
import { z } from 'zod';
import {
  appConnectionSchema,
  appCliSourceSchema,
  appSchemaId,
  appContractSchemaId,
  type AppDefinitionInput,
  type AppManifest,
  type AppMcpConfig,
  type AppContractInput,
} from '../src/shared/app-definitions.ts';

const common = { name: z.string().optional(), directory: z.string().optional() };
const optionsSchema = z.union([
  z.strictObject({
    ...common,
    type: z.literal('mcp').default('mcp'),
    url: z.string(),
    auth: z.enum(['oauth2', 'bearer', 'x-api-key']),
  }),
  z.strictObject({
    ...common,
    type: z.literal('http'),
    url: z.string(),
    auth: z.enum(['oauth2', 'bearer', 'x-api-key']),
  }),
  z.strictObject({
    ...common,
    type: z.literal('cli'),
    command: z.string(),
    source: appCliSourceSchema,
    environment: z.record(z.string(), z.string()),
    auth: z.literal('env'),
  }),
]);
export type CreateAppOptions = z.input<typeof optionsSchema>;

export async function createApp(slug: string, input: CreateAppOptions) {
  if (!/^[a-z][a-z0-9-]{0,38}[a-z0-9]$/.test(slug) || /--/.test(slug))
    throw new Error(
      'Use two to 40 lowercase letters, digits, or single hyphens. Start with a letter and end with a letter or digit.',
    );
  const options = optionsSchema.parse(input);
  const address =
    options.type === 'cli'
      ? 'url' in options.source
        ? options.source.url
        : undefined
      : options.url;
  if (address) {
    const url = URL.parse(address);
    if (
      !url ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      (url.port && !['80', '443'].includes(url.port)) ||
      /[?#]/.test(address) ||
      isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
      /(?:^|\.)(?:localhost|local|internal|invalid|test|example|example\.(?:com|org|net))$/.test(
        url.hostname.replace(/\.$/, ''),
      )
    )
      throw new Error(
        'Enter a public HTTPS address on port 80 or 443 without credentials, a query, or a fragment.',
      );
  }
  const name = (options.name ?? slug).trim();
  if (!name || name.length > 80) throw new Error('Enter an app name with one to 80 characters.');
  const connection = appConnectionSchema.parse(
    options.type === 'cli'
      ? {
          type: 'cli',
          command: options.command,
          source: options.source,
          environment: options.environment,
          authentication: ['env'],
        }
      : options.type === 'http'
        ? { type: 'http', url: new URL(options.url).href, authentication: [options.auth] }
        : { type: 'mcp', server: slug, authentication: [options.auth] },
  );
  const fixture: Pick<AppContractInput, '$schema' | 'source' | 'output'> = {
    $schema: appContractSchemaId,
    source: 'https://example.com/replace-with-provider-docs',
    output: { records: [{ id: 'synthetic-record', title: 'Sample record' }] },
  };
  const contract: AppContractInput =
    options.type === 'http'
      ? {
          ...fixture,
          type: 'http',
          request: { method: 'GET', path: 'replace-with-read-path' },
          annotations: { readOnlyHint: true },
        }
      : options.type === 'cli'
        ? {
            ...fixture,
            type: 'cli',
            argv: ['replace-with-read-command', '--json'],
            timeoutSeconds: 30,
            format: 'json',
            annotations: { readOnlyHint: true },
          }
        : {
            ...fixture,
            type: 'mcp',
            tool: {
              name: 'replace_with_read_tool',
              description: 'Replace with the documented read tool.',
              inputSchema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
              annotations: { readOnlyHint: true },
            },
            input: { query: 'synthetic example' },
          };
  const files: Record<string, unknown> = {
    'plugin.json': {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      name: slug,
      version: '0.1.0',
      description: `Connect ${name} to Nod.`,
      license: 'Apache-2.0',
      author: { name: 'Replace with the maintainer name' },
      extensions: { 'io.n8n.nod': { app: './io.n8n.nod/app.json' } },
    } satisfies AppManifest,
    'io.n8n.nod/app.json': {
      $schema: appSchemaId,
      displayName: name,
      prompts: [`Find a record in ${name}.`, `Summarize a record in ${name}.`],
      requirements: ['Replace with the required account plan and permissions.'],
      limitations: ['Replace with the limits of this connection.'],
      connection,
    } satisfies AppDefinitionInput,
    'io.n8n.nod/contract.json': contract,
  };
  if (options.type === 'mcp')
    files['mcp.json'] = {
      $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
      mcpServers: { [slug]: { type: 'streamable-http', url: new URL(options.url).href } },
    } satisfies AppMcpConfig;
  const root = resolve(
    options.directory ?? fileURLToPath(new URL('../src/apps/', import.meta.url)),
  );
  const directory = join(root, slug);
  await mkdir(root, { recursive: true });
  await mkdir(directory);
  await mkdir(join(directory, 'io.n8n.nod'));
  for (const [path, value] of Object.entries(files))
    await writeFile(join(directory, path), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  return directory;
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      type: { type: 'string' },
      url: { type: 'string' },
      name: { type: 'string' },
      auth: { type: 'string' },
      directory: { type: 'string' },
      command: { type: 'string' },
      npm: { type: 'string' },
      pypi: { type: 'string' },
      download: { type: 'string' },
      sha256: { type: 'string' },
      env: { type: 'string', multiple: true },
    },
  });
  if (positionals.length !== 1 || !values.auth)
    throw new Error(
      'Use pnpm create:app <app-id> --type mcp|http|cli --auth <method>. Set --url for MCP or API apps. Set --command, --env and a pinned --npm, --pypi or --download source for CLI apps.',
    );
  const type = values.type ?? 'mcp';
  if (
    type !== 'cli' &&
    (values.command || values.npm || values.pypi || values.download || values.sha256 || values.env)
  )
    throw new Error('Command, source and environment options require --type cli.');
  if (
    type === 'cli' &&
    (values.url ||
      [values.npm, values.pypi, values.download].filter(Boolean).length !== 1 ||
      (values.sha256 && !values.download))
  )
    throw new Error(
      'Select exactly one pinned --npm, --pypi or --download source. Downloaded commands also need --sha256.',
    );
  if (values.env && new Set(values.env).size !== values.env.length)
    throw new Error('List each credential environment name once.');
  const options = optionsSchema.parse({
    type,
    name: values.name,
    auth: values.auth,
    directory: values.directory,
    ...(type === 'cli'
      ? {
          command: values.command,
          source: values.npm
            ? { npm: values.npm }
            : values.pypi
              ? { pypi: values.pypi }
              : { url: values.download, sha256: values.sha256 },
          environment: Object.fromEntries(
            (values.env ?? []).map((name) => [
              name,
              name
                .toLowerCase()
                .replaceAll('_', ' ')
                .replace(/^./, (letter) => letter.toUpperCase()),
            ]),
          ),
        }
      : { url: values.url }),
  });
  const directory = await createApp(positionals[0], options);
  console.log(
    `Created ${directory}. Complete the maintainer, requirements, limits, provider documentation and read fixture. Then run pnpm check:apps ${positionals[0]}.`,
  );
}
