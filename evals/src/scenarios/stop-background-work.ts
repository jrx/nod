import { check, scenario } from '../scenario.ts';
import { createApps } from '../world/apps.ts';

const owner = { name: 'Alex Rivera', email: 'alex.rivera@riveradesign.example' };

export default scenario({
  id: 'stop-background-work',
  title: 'Stop all background work',
  linear: 'LAB-1156',
  capabilities: ['schedules'],
  tier: 'release',
  calibration: 'pending',
  complexity: 'simple',
  stance: 'regression',
  seconds: 300,
  user: {
    approve: true,
    persona:
      'You are Alex Rivera. Nod keeps spending credits in the background and you want that work to stop until you turn it back on yourself. Your own Friday invoice reminder is cheap and useful: if Nod asks about it, keep it running.',
  },
  world() {
    return {
      apps: createApps(owner, {}),
      state: {
        paused: undefined as boolean | undefined,
        schedules: [] as Array<{ title: string; enabled: boolean }>,
      },
    };
  },
  async play(session, world) {
    await session.say('Every Friday at 17:00, remind me here to send my invoices.');
    await session.say('Stop all background work, it keeps using credits.');
    world.state.paused = (await session.api('GET', '/api/preferences')).body.proactivePaused;
    const saved = await session.api('GET', '/api/schedules');
    world.state.schedules = Array.isArray(saved.body) ? saved.body : [];
  },
  expect(world) {
    return [
      check('automatic-preparation-paused', () => ({
        pass: world.state.paused === true,
        evidence: `proactivePaused at the end: ${String(world.state.paused)}`,
      })),
      check('owner-schedule-kept', () => ({
        pass: world.state.schedules.length === 1 && world.state.schedules[0]!.enabled,
        evidence: `Schedules at the end: ${world.state.schedules.map((item) => `"${item.title}" enabled=${item.enabled}`).join('; ') || 'none'}`,
      })),
    ];
  },
});
