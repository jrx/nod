import type { FeedbackDelivery } from '../ports/feedback.ts';
import { createN8nFeedback } from '../providers/n8n/feedback.ts';

export function createFeedbackDelivery(
  env: Record<string, string | undefined> = process.env,
): FeedbackDelivery {
  const defaultFeedbackUrl = 'https://internal.users.n8n.cloud/webhook/nod/feedback';
  const feedbackUrl = env.NOD_FEEDBACK_URL ?? defaultFeedbackUrl;
  const feedbackEnabled = env.NOD_FEEDBACK_ENABLED !== 'false';
  if (
    feedbackEnabled &&
    feedbackUrl &&
    feedbackUrl !== defaultFeedbackUrl &&
    !env.NOD_FEEDBACK_RECEIPT_URL_PREFIX
  )
    throw Object.assign(
      new Error('Set NOD_FEEDBACK_RECEIPT_URL_PREFIX when using a custom feedback intake.'),
      { code: 'FEEDBACK_RECEIPT_PREFIX_REQUIRED' },
    );
  return createN8nFeedback({
    enabled: feedbackEnabled,
    url: feedbackUrl,
    token: env.NOD_FEEDBACK_TOKEN,
    receiptUrlPrefix:
      feedbackUrl === defaultFeedbackUrl ? undefined : env.NOD_FEEDBACK_RECEIPT_URL_PREFIX,
    recipient: feedbackUrl === defaultFeedbackUrl ? 'n8n' : undefined,
  });
}
