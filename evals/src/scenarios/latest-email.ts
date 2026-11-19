import { check, scenario } from '../scenario.ts';
import { createApps, gmail } from '../world/apps.ts';

const owner = { name: 'Alex Rivera', email: 'alex.rivera@riveradesign.example' };
const newest = 'Harbour lights shoot moved to Thursday';
const older = ['Invoice 2291 for October', 'Weekly studio digest'];

export default scenario({
  id: 'latest-email',
  title: 'Latest email: the owner asks for their newest email and gets its subject',
  linear: 'LAB-1302',
  capabilities: ['apps'],
  tier: 'pr',
  complexity: 'simple',
  stance: 'regression',
  seconds: 180,
  user: {},
  world(clock) {
    const hour = 3_600_000;
    return {
      apps: createApps(owner, {
        gmail: gmail(
          owner,
          [
            {
              id: 'digest',
              from: 'Studio Weekly <digest@studioweekly.example>',
              subject: older[1],
              body: 'Your weekly roundup of studio news.',
              at: clock.now() - 30 * hour,
            },
            {
              id: 'invoice',
              from: 'Billing <billing@printhouse.example>',
              subject: older[0],
              body: 'Invoice 2291 is attached. Payment is due in 30 days.',
              at: clock.now() - 6 * hour,
            },
            {
              id: 'shoot',
              from: 'Maya Chen <maya@harbourlights.example>',
              subject: newest,
              body: 'Hi Alex, the shoot moves to Thursday at 10:00. Same location.',
              at: clock.now() - hour / 2,
            },
          ],
          clock.now,
        ),
      }),
    };
  },
  async play(session) {
    await session.say('What is my latest email?');
  },
  expect() {
    return [
      check(
        'read-gmail',
        (run) =>
          run.tools.some(
            (call) =>
              call.name === 'apps' && !call.isError && call.input?.action === 'GMAIL_FETCH_EMAILS',
          ),
        {
          aspect: 'process',
        },
      ),
      check('named-the-newest-email', (run) => ({
        pass: /harbour lights shoot/i.test(run.said),
        evidence: run.said.slice(0, 400),
      })),
    ];
  },
});
