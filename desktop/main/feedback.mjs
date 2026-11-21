import { register } from 'tsx/esm/api';
import { trustSystemCertificates } from './system-certificates.mjs';
import {
  StartupFeedbackError,
  startupFailureMessage,
} from '../../src/shared/startup-feedback-facts.mjs';

trustSystemCertificates();
register();
const { createFeedbackDelivery } = await import('../../src/server/feedback-delivery.ts');
const { createStartupFeedback } = await import('../../src/server/startup-feedback.ts');
let feedback;
let configuration;
process.parentPort.on('message', async ({ data }) => {
  const { id, action, input } = data;
  try {
    if (action === 'initialize') {
      if (feedback) throw new StartupFeedbackError('helper_initialized');
      configuration = {
        dataRoot: input.dataRoot,
        context: input.context,
        status: input.status,
        startupLog: input.startupLog,
        delivery: createFeedbackDelivery(process.env),
      };
      feedback = createStartupFeedback(configuration);
    } else if (action === 'snapshot' && feedback) {
      configuration.status = input.status;
      configuration.startupLog = input.startupLog;
    } else if (
      !feedback ||
      !['context', 'review', 'send', 'status', 'repair', 'recover'].includes(action)
    ) {
      throw new StartupFeedbackError('action_unavailable');
    }
    const value = ['initialize', 'snapshot'].includes(action)
      ? null
      : await feedback[action](input);
    process.parentPort.postMessage({ id, value });
  } catch (error) {
    process.parentPort.postMessage({ id, error: startupFailureMessage(error) });
  }
});
process.parentPort.postMessage({ ready: true });
