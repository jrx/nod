import { reportBugCase } from '../world/report-bug.ts';

export default reportBugCase({
  id: 'report-bug-offer',
  title: 'Offer a bug report when a Nod screen is broken',
  message:
    'The Scheduled screen in Nod shows a blank page every time I open it, even after restarting the app. It started yesterday.',
  nodProblem: true,
});
