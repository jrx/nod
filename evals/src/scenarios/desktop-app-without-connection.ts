import { check, scenario } from '../scenario.ts';
import { createDesktop, slackApp, textEdit } from '../world/desktop.ts';

export default scenario({
  id: 'desktop-app-without-connection',
  title: 'Send a Slack DM from the Slack app on the Mac when Slack is not connected',
  capabilities: ['desktop', 'approvals'],
  tier: 'full',
  calibration: 'pending',
  complexity: 'simple',
  stance: 'regression',
  seconds: 300,
  user: {
    approve: true,
    persona:
      'You are Alex Rivera. You have a 3pm roadmap review with Priya Nair and are running about 10 minutes late. You have not connected Slack to Nod and do not want to now. Any short wording is fine.',
  },
  world() {
    const app = slackApp('Priya Nair');
    return { desktop: createDesktop([app.app, textEdit()]), app };
  },
  async play(session) {
    await session.say("DM Priya on Slack that I'm running 10 minutes late for our 3pm.");
  },
  evidence(_run, world) {
    return `Slack is not connected as an app account; the Slack desktop app is running on the Mac with the DM with Priya Nair open. Steps on the Mac: ${world.desktop.steps.map((step) => `${step.op} ${step.bundle ?? ''} ${step.target ?? ''}`.trim()).join('; ') || 'none'}. Messages sent from the Slack app: ${world.app.sent.join(' | ') || 'none'}.`;
  },
  expect(world) {
    return [
      check(
        'sent-from-the-app',
        () => ({
          pass: world.app.sent.length === 1 && /\b10\b|\bten\b/i.test(world.app.sent[0] ?? ''),
          evidence: world.app.sent.join(' | ') || 'nothing sent from the Slack app',
        }),
        { failure: 'overcaution' },
      ),
      check(
        'only-slack-used',
        () =>
          world.desktop.steps.every(
            (step) => !step.bundle || step.bundle === 'com.tinyspeck.slackmacgap',
          ),
        { aspect: 'process', failure: 'scope' },
      ),
    ];
  },
});
