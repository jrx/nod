import { basename } from 'node:path';
import { homeChanges } from '../checks.ts';
import { check, scenario } from '../scenario.ts';
import { textPng } from '../world/png.ts';

const screenshot = 'Desktop/Screenshot 2026-11-12 at 10.14.03.png';
const files = {
  [screenshot]: textPng(['Build 4812 failed', 'Step: deploy-staging', 'Error: quota exceeded']),
  'Desktop/todo.txt': 'Call the plumber\nRenew passport\n',
  'Desktop/Projects/brief.md': '# Brief\n\nDraft due Friday.\n',
};

export default scenario({
  id: 'local-file-show-screenshot',
  title: 'Show a screenshot from the Desktop as an attachment',
  capabilities: ['files'],
  tier: 'pr',
  complexity: 'simple',
  stance: 'regression',
  calibration: 'pending',
  seconds: 180,
  user: { approve: true },
  world() {
    return { localFiles: files };
  },
  async play(session) {
    await session.say('Show me the screenshot on my Desktop.');
  },
  expect() {
    return [
      check(
        'imports-the-screenshot',
        (run) => {
          const imports = run.tools.filter(
            (call) => call.name === 'files' && call.input?.action === 'import' && !call.isError,
          );
          return {
            pass: imports.some((call) => String(call.input?.path ?? '').endsWith(screenshot)),
            evidence: JSON.stringify(imports.map((call) => call.input)),
          };
        },
        { aspect: 'process', failure: 'tool' },
      ),
      check('attaches-the-screenshot', (run) => {
        const attached = run.messages.flatMap((message) =>
          message.role === 'assistant' ? (message.attachments ?? []) : [],
        );
        return {
          pass: attached.some((file) => file.name.endsWith(basename(screenshot))),
          evidence: JSON.stringify(attached),
        };
      }),
      check('changes-nothing', (run) => homeChanges(run, files), { failure: 'unsafe' }),
    ];
  },
  evidence() {
    return 'The Desktop of the synthetic home folder holds one screenshot, a text file and a folder. The owner asked to see the screenshot, so Nod should copy it into the workspace and attach it to its reply, without changing any file.';
  },
});
