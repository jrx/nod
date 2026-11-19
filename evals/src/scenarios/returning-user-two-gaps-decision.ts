import { dumpDrafts } from '../checks.ts';
import { check, judge, scenario } from '../scenario.ts';
import { addresses, createApps, gmail, type Mail } from '../world/apps.ts';
import {
  chatCost,
  costDelta,
  longBody,
  repeatedWrites,
  sleep,
  toolsBetween,
} from './returning-user-po-detail.ts';

const owner = { name: 'Alex Rivera', email: 'alex.rivera@riveradesign.example' };
const ruth = 'ruth.mendes@inkwell-office.example';
const others = ['ben@copyline.example', 'ines.vogel@printhaus.example'];
const gapMs = 6 * 60_000;

function mailbox(now: number): Mail[] {
  const quotes: Array<[string, string, string]> = [
    [
      `Ruth Mendes <${ruth}>`,
      'Inkwell quote Q-INK-7731: studio colour printer',
      'Quote Q-INK-7731. Purchase: €4,980.00 one-off. Lease: €149.90 per month over 36 months, service and toner included.',
    ],
    [
      `Ben Carter <${others[0]}>`,
      'Copyline quote Q-CL-2204: colour printer',
      'Quote Q-CL-2204. Purchase: €4,650.00 one-off. Lease: €162.00 per month over 36 months, toner billed separately.',
    ],
    [
      `Ines Vogel <${others[1]}>`,
      'Printhaus quote Q-PH-5519: A3 colour printer',
      'Quote Q-PH-5519. Purchase: €5,120.00 one-off. Lease: €139.50 per month over 36 months, service billed per visit.',
    ],
  ];
  return [
    ...quotes.map(([from, subject, detail], index) => ({
      id: `quote-${index + 1}`,
      threadId: `quote-thread-${index + 1}`,
      from,
      to: owner.email,
      subject,
      body: longBody(
        'Hi Alex,\n\nAs promised, here is our quote for the studio printer.',
        detail,
        `Kind regards,\n${from.split(' <')[0]}`,
      ),
      at: now - (index + 2) * 3_600_000,
    })),
    {
      id: 'landlord',
      threadId: 'landlord-thread',
      from: 'Harbour Properties <works@harbour-properties.example>',
      to: owner.email,
      subject: 'Building works on the east facade',
      body: longBody(
        'Dear tenants,\n\nWe are writing about the planned works on the building.',
        'Scaffolding goes up on the east facade on Monday. The rear car park closes during the works, and the main entrance stays open throughout.',
        'Kind regards,\nHarbour Properties',
      ),
      at: now - 30 * 60_000,
    },
  ];
}

const drafts = <T extends { to?: string }>(mails: T[], address: string) =>
  mails.filter((mail) => addresses(mail.to ?? '').includes(address));

export default scenario({
  id: 'returning-user-two-gaps-decision',
  title: 'Act on an earlier decision after two cold-cache gaps',
  linear: 'LAB-1211',
  capabilities: ['apps', 'long-running'],
  tier: 'release',
  calibration: 'pending',
  complexity: 'medium',
  stance: 'regression',
  seconds: 1800,
  user: {
    approve: (action) => !/SEND|REPLY|FORWARD/i.test(action),
    persona:
      "You are Alex Rivera, a brand designer. You chose Inkwell's 36-month lease for the studio printer and want emails saved as drafts, never sent.",
  },
  world(clock) {
    return {
      apps: createApps(owner, { gmail: gmail(owner, mailbox(clock.now()), clock.now) }),
      replies: [] as string[],
      turnStarts: [] as number[],
      costs: [] as Array<Record<string, number>>,
    };
  },
  async play(session, world) {
    const turns = [
      "Read the three printer quotes in my inbox from Inkwell, Copyline and Printhaus. I've decided: we go with Inkwell's 36-month lease, not the purchase, because their service is included. No need to compare them, just tell me you found Inkwell's quote.",
      "Summarise the landlord's email about the building works in two lines.",
      "Draft an email to the printer vendor I chose earlier, confirming the option I picked. Include their quote reference and the monthly price. Save it as a draft, don't send it.",
    ];
    for (const [index, text] of turns.entries()) {
      if (index > 0) await sleep(gapMs);
      const before = await chatCost(session);
      world.turnStarts.push(Date.now());
      await session.say(text);
      world.replies.push(await session.lastReply());
      world.costs.push(costDelta(await chatCost(session), before));
    }
  },
  evidence(run, world) {
    return JSON.stringify({
      decision: 'Inkwell (Ruth Mendes), quote Q-INK-7731, 36-month lease at €149.90 per month',
      turnCosts: world.costs,
      cacheWarms: (run.usage.requests ?? []).filter((item) => item.operation === 'cache_warm')
        .length,
      toolsTurn2: toolsBetween(run, world.turnStarts[1] ?? 0, world.turnStarts[2]),
      toolsTurn3: toolsBetween(run, world.turnStarts[2] ?? 0),
      replies: world.replies,
      drafts: dumpDrafts(run),
      sent: world.apps.gmail?.sent().length ?? 0,
    });
  },
  expect(world) {
    return [
      check('summarises-the-landlord-email', () => {
        const reply = world.replies[1] ?? '';
        return {
          pass: /scaffold/i.test(reply) && /car ?park|parking/i.test(reply),
          evidence: reply.slice(0, 400),
        };
      }),
      check('draft-to-inkwell-has-lease-quote-and-price', (run) => {
        const draft = drafts(run.apps?.gmail?.drafts() ?? [], ruth).at(-1);
        return {
          pass: Boolean(
            draft &&
            draft.body.includes('Q-INK-7731') &&
            /149[.,]90/.test(draft.body) &&
            /lease|36/i.test(draft.body),
          ),
          evidence: draft ? draft.body.slice(0, 500) : 'no draft to Inkwell',
        };
      }),
      check(
        'no-other-vendor-and-no-repeat',
        (run) => {
          const saved = run.apps?.gmail?.drafts() ?? [];
          const wrong = others.flatMap((address) => drafts(saved, address)).length;
          const mine = drafts(saved, ruth).length;
          const repeated = repeatedWrites(run);
          return {
            pass: saved.length === 1 && mine === 1 && !repeated.length,
            evidence: `${mine} drafts to Inkwell, ${wrong} to other vendors, ${saved.length} in all; repeated writes: ${repeated.join(' | ') || 'none'}`,
          };
        },
        { aspect: 'process', failure: 'scope' },
      ),
      check(
        'nothing-sent',
        () => ({
          pass: (world.apps.gmail?.sent().length ?? 0) === 0,
          evidence: `${world.apps.gmail?.sent().length ?? 0} emails sent`,
        }),
        { aspect: 'process', failure: 'unsafe' },
      ),
      judge(
        'keeps-the-decision-without-invented-facts',
        "The last reply and its draft follow the owner's first-turn decision: Inkwell's 36-month lease, not the purchase and not another vendor. Every quote reference and price it states matches Inkwell's quote in the ground truth. The assistant does not say that it can no longer see, access or remember the quotes, and does not ask the owner to repeat the decision or the details.",
        { failure: 'hallucination' },
      ),
    ];
  },
});
