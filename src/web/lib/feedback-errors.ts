import { resetFeedbackClient } from './feedback-client';

type FeedbackError = {
  at: number;
  type: 'render' | 'error' | 'rejection';
  message: string;
  stack?: string;
  count: number;
};

const entries: FeedbackError[] = [];
let owner: string | null = null;
let lastOwner: string | null = null;
let switchedOwner = false;
const bounded = (text: string) =>
  text.length <= 8192 ? text : '[error detail omitted: content limit]';

export function setFeedbackErrorOwner(id: string | null) {
  if (owner === id) return;
  if (id !== null) {
    if (lastOwner !== null && lastOwner !== id) switchedOwner = true;
    lastOwner = id;
  }
  owner = id;
  entries.length = 0;
  resetFeedbackClient();
}

export function recordFeedbackError(type: FeedbackError['type'], error: unknown) {
  if (!owner || switchedOwner) return;
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
  const last = entries.at(-1);
  if (
    last &&
    last.type === type &&
    last.message === bounded(message) &&
    Date.now() - last.at <= 1_800_000
  ) {
    last.at = Date.now();
    last.count++;
    return;
  }
  entries.push({
    at: Date.now(),
    type,
    count: 1,
    message: bounded(message),
    ...(error instanceof Error && error.stack ? { stack: bounded(error.stack) } : {}),
  });
  if (entries.length > 10) entries.shift();
}

export function feedbackErrorsSnapshot() {
  const now = Date.now();
  return entries
    .filter((entry) => now - entry.at <= 1_800_000)
    .map(({ at, count, message, ...entry }) => ({
      ...entry,
      message: count > 1 ? `${message.slice(0, 8170)} (x${count})` : message,
      ageMs: now - at,
    }));
}

export function feedbackErrorsAvailable() {
  return owner !== null && !switchedOwner;
}
