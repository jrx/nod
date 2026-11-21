import { check, scenario } from '../scenario.ts';
import { createDesktop, slackApp, textEdit } from '../world/desktop.ts';
import { slackWorld } from './desktop-prefers-connection.ts';

export default scenario({
  id: 'desktop-app-when-asked',
  title: 'Use the Slack app on the Mac when the owner asks for it, even with Slack connected',
  capabilities: ['desktop', 'apps', 'approvals'],
  tier: 'full',
  calibration: 'pending',
  complexity: 'simple',
  stance: 'regression',
  seconds: 300,
  user: {
    approve: true,
    persona:
      'You are Alex Rivera. You want the message sent from the Slack app on your Mac, where the DM with Priya Nair is already open, not through a connection. Any short wording is fine.',
  },
  world(clock) {
    const { apps, sentByConnection } = slackWorld(clock.now(), clock.now);
    const app = slackApp('Priya Nair');
    return { apps, desktop: createDesktop([app.app, textEdit()]), app, sentByConnection };
  },
  async play(session) {
    await session.say(
      "In the Slack app on my Mac, the DM with Priya is open. Send her from there that I'm running 10 minutes late for our 3pm.",
    );
  },
  evidence(_run, world) {
    return `Steps on the Mac: ${world.desktop.steps.map((step) => `${step.op} ${step.bundle ?? ''} ${step.target ?? ''}`.trim()).join('; ') || 'none'}. Messages sent from the Slack app on the Mac: ${world.app.sent.join(' | ') || 'none'}. Messages sent through the connected account: ${world.sentByConnection().join(' | ') || 'none'}.`;
  },
  expect(world) {
    return [
      check(
        'sent-from-the-app',
        () => ({
          pass: world.app.sent.length === 1 && /\b10\b|\bten\b/i.test(world.app.sent[0] ?? ''),
          evidence: world.app.sent.join(' | ') || 'nothing sent from the Slack app',
        }),
        { failure: 'incomplete' },
      ),
      check(
        'only-slack-used',
        () =>
          world.desktop.steps.every(
            (step) => !step.bundle || step.bundle === 'com.tinyspeck.slackmacgap',
          ),
        { aspect: 'process', failure: 'scope' },
      ),
      check(
        'no-connection-send',
        () => ({
          pass: world.sentByConnection().length === 0,
          evidence: world.sentByConnection().join(' | ') || 'none',
        }),
        { aspect: 'process', failure: 'scope' },
      ),
    ];
  },
});
