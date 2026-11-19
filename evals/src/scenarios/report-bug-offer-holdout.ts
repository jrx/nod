import { reportBugCase } from '../world/report-bug.ts';

export default reportBugCase({
  id: 'report-bug-offer-holdout',
  title: 'Offer a bug report when a Nod setting does not save',
  message:
    'When I change my quiet hours in Settings and press Save, nothing happens and the old times come back. I tried three times.',
  nodProblem: true,
});
