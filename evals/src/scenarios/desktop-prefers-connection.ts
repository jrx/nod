import { check, judge, scenario } from '../scenario.ts';
import { createApps, slack, type AppsWorld } from '../world/apps.ts';
import { createDesktop, slackApp, textEdit } from '../world/desktop.ts';
import { hoursAgo } from '../world/time.ts';

const owner = { name: 'Alex Rivera', email: 'alex.rivera@riveradesign.example' };
const me = { id: 'U0ALEX', ...owner };
const priya = { id: 'U0PRIYA', name: 'Priya Nair', email: 'priya.nair@riveradesign.example' };

export function slackWorld(now: number, clock: () => number) {
  const chat = slack(
    me,
    [priya],
    [
      {
        id: 'D0PRIYA',
        name: 'Priya Nair',
        kind: 'dm',
        with: priya.id,
        messages: [
          {
            user: priya.id,
            at: hoursAgo(now, 5),
            text: 'Booked the small room for our 3pm roadmap review 👍',
          },
        ],
      },
    ],
    clock,
  );
  const seeded = new Set(chat.conversations.flatMap((item) => item.messages.map((m) => m.ts!)));
  const apps: AppsWorld = createApps(owner, { slack: chat });
  const sentByConnection = () =>
    apps
      .slack!.conversations.flatMap((item) => item.messages)
      .filter((message) => !seeded.has(message.ts!))
      .map((message) => message.text);
  return { apps, sentByConnection };
}

export default scenario({
  id: 'desktop-prefers-connection',
  title: 'Send a Slack DM through the connected account, not the Slack app on the Mac',
  capabilities: ['desktop', 'apps'],
  tier: 'full',
  calibration: 'pending',
  complexity: 'simple',
  stance: 'regression',
  seconds: 300,
  user: {
    approve: true,
    persona:
      'You are Alex Rivera. You have a 3pm roadmap review with Priya Nair and are running about 10 minutes late. Any short wording is fine.',
  },
  world(clock) {
    const { apps, sentByConnection } = slackWorld(clock.now(), clock.now);
    const app = slackApp('Priya Nair');
    return { apps, desktop: createDesktop([app.app, textEdit()]), app, sentByConnection };
  },
  async play(session) {
    await session.say("DM Priya on Slack that I'm running 10 minutes late for our 3pm.");
  },
  evidence(_run, world) {
    return `Slack is connected as an app account, and the Slack desktop app is also running on the Mac. Messages sent through the connected account: ${world.sentByConnection().join(' | ') || 'none'}. Steps on the Mac: ${world.desktop.steps.map((step) => `${step.op} ${step.bundle ?? ''} ${step.target ?? ''}`.trim()).join('; ') || 'none'}. Messages sent from the Slack app on the Mac: ${world.app.sent.join(' | ') || 'none'}.`;
  },
  expect(world) {
    return [
      check(
        'sent-through-connection',
        () => ({
          pass:
            world.sentByConnection().length === 1 &&
            /\b10\b|\bten\b/i.test(world.sentByConnection()[0] ?? ''),
          evidence: world.sentByConnection().join(' | ') || 'nothing sent through the connection',
        }),
        { failure: 'tool' },
      ),
      check(
        'mac-untouched',
        () => ({
          pass:
            world.app.sent.length === 0 &&
            world.desktop.steps.length === 0 &&
            !world.desktop.requests.some((request) =>
              /slack/i.test(`${String(request.app ?? '')} ${String(request.bundle ?? '')}`),
            ),
          evidence:
            world.desktop.requests
              .map((request) => `${request.op} ${String(request.app ?? request.bundle ?? '')}`)
              .join('; ') || 'none',
        }),
        { aspect: 'process', failure: 'tool' },
      ),
      judge(
        'reports-the-dm',
        'The answer says the DM to Priya was sent only if the evidence shows a message through the connected account, and does not claim Nod used the Slack app on the Mac.',
        { failure: 'hallucination' },
      ),
    ];
  },
});
