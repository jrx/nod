import { reportBugCase } from '../world/report-bug.ts';

export default reportBugCase({
  id: 'report-bug-app-reconnect',
  title: 'No bug report offer when an app needs reconnecting',
  message: 'What does my latest email say?',
  nodProblem: false,
});
