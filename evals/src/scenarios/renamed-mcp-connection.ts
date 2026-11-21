import { check, scenario } from '../scenario.ts';
import type { Session } from '../session.ts';
import { remoteMcp, type McpRecorder } from '../world/mcp.ts';

const newName = 'Studio Cabinet';
const wantedCode = 'KITE-713';
const readTool = 'read_catalog_reference';
const fixtures = [
  { host: 'hatch-archive.example', name: 'Hatch Archive', code: 'EMBER-482' },
  { host: 'birch-archive.example', name: 'Birch Archive', code: wantedCode },
];

type SavedConnection = { slug: string; name: string; status: string; connectionId: string };

async function connect(session: Session, fixture: (typeof fixtures)[number]) {
  const origin = `https://${fixture.host}`;
  const proposal = await session.api('POST', '/api/apps/mcp', {
    name: fixture.name,
    endpoint: `${origin}/mcp`,
    auth: 'oauth',
  });
  if (proposal.status !== 200 || typeof proposal.body.id !== 'string')
    throw new Error(`Could not create the synthetic MCP connection (${proposal.status}).`);

  const path = `/api/apps/discovery/${proposal.body.id}`;
  const { body: details } = await session.api('GET', path);
  const started = await session.api('POST', `${path}/authorize`, { returnTo: 'apps' });
  if (started.status !== 200 || new URL(started.body.url).origin !== origin)
    throw new Error(`Could not start the synthetic MCP sign-in (${started.status}).`);

  const consent = await fetch(started.body.url, { redirect: 'manual' });
  const callback = consent.headers.get('location');
  if (!callback) throw new Error('The synthetic MCP sign-in did not return to Nod.');
  const { pathname, search } = new URL(callback);
  if (pathname !== '/api/apps/callback') throw new Error('Unexpected sign-in callback.');
  const finished = await session.api('GET', pathname + search, undefined, 'manual');
  if (finished.status !== 302)
    throw new Error(`The synthetic MCP sign-in callback did not redirect (${finished.status}).`);

  const { body } = await session.api('GET', '/api/apps');
  const account = (body as SavedConnection[]).find(
    (entry) => entry.slug === details.service && entry.status === 'connected',
  );
  if (!account) throw new Error('The synthetic MCP connection was not saved.');
  return account;
}

export default scenario({
  id: 'renamed-mcp-connection',
  title: 'Read a catalog reference using a custom app’s new name',
  linear: 'LAB-1203',
  capabilities: ['apps'],
  tier: 'full',
  calibration: 'pending',
  complexity: 'simple',
  stance: 'regression',
  seconds: 120,
  user: { approve: (action) => action === 'CONNECTED_MCP_CALL' },
  world() {
    const recorders: McpRecorder[] = fixtures.map(() => ({ calls: [], writes: [] }));
    return {
      sites: Object.fromEntries(
        fixtures.map(({ host, name, code }, index) => [
          host,
          remoteMcp({
            host,
            name,
            recorder: recorders[index],
            tools: [
              {
                name: readTool,
                description: 'Read the reference code for a catalog by season.',
                inputSchema: {
                  type: 'object',
                  properties: { season: { type: 'string' } },
                  required: ['season'],
                },
                run({ season }) {
                  if (season.trim().toLowerCase() !== 'spring')
                    throw new Error('No catalog for that season.');
                  return { referenceCode: code };
                },
              },
            ],
          }),
        ]),
      ),
      recorders,
      previous: undefined as SavedConnection | undefined,
    };
  },
  async play(session, world) {
    await connect(session, fixtures[0]);
    world.previous = await connect(session, fixtures[1]);
    const renamed = await session.api('PATCH', `/api/apps/mcp/${world.previous.slug}`, {
      name: newName,
    });
    if (renamed.status !== 200 && renamed.status !== 404)
      throw new Error(`Renaming the synthetic MCP connection failed (${renamed.status}).`);
    await session.say(
      `What is the spring catalog’s reference code in ${newName}? Please use my connected app and give me just the code.`,
    );
  },
  expect(world) {
    return [
      check('owned-connection-retains-identity', async (run) => {
        const { body } = await run.api('GET', '/api/apps');
        const account = (body as SavedConnection[]).find(
          (entry) => entry.connectionId === world.previous?.connectionId,
        );
        return {
          pass:
            account?.slug === world.previous?.slug &&
            account?.status === 'connected' &&
            account?.name === newName,
          evidence: account?.name ?? 'Missing connection',
        };
      }),
      check('reads-the-renamed-server', () => {
        const [other, target] = world.recorders;
        return {
          pass:
            other.calls.length === 0 &&
            target.calls.some(({ slug, error }) => slug === readTool && !error),
          evidence: `${other.calls.length} calls to the other connection, ${target.calls.length} to the selected connection.`,
        };
      }),
      check('gives-the-reference-code', (run) => run.final.includes(wantedCode)),
    ];
  },
});
