export const feedbackClient: {
  sources: EventSource[];
  lastEventAt: number | null;
  streamReconnects: number;
  savedMessages: number | null;
  pendingTurn: boolean | null;
  clockOffsetMs: number | null;
} = {
  sources: [],
  lastEventAt: null,
  streamReconnects: 0,
  savedMessages: null,
  pendingTurn: null,
  clockOffsetMs: null,
};

export function resetFeedbackClient() {
  Object.assign(feedbackClient, {
    lastEventAt: null,
    streamReconnects: 0,
    savedMessages: null,
    pendingTurn: null,
    clockOffsetMs: null,
  });
}

const count = (value: number, max = 1_000_000) =>
  Math.min(max, Math.max(0, Math.round(value) || 0));
const age = (value: number) => count(value, 31_536_000_000);

export function feedbackClientState() {
  const { lastEventAt, savedMessages, clockOffsetMs } = feedbackClient;
  const source = feedbackClient.sources.at(-1);
  const locale = navigator.language;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    online: navigator.onLine,
    visibility: document.visibilityState === 'visible' ? 'visible' : 'hidden',
    stream: source ? (['connecting', 'open', 'closed'][source.readyState] ?? 'unknown') : 'unknown',
    lastEventAgeMs: lastEventAt === null ? null : age(Date.now() - lastEventAt),
    streamReconnects: count(feedbackClient.streamReconnects),
    savedMessages: savedMessages === null ? null : count(savedMessages),
    renderedMessages: count(document.querySelectorAll('[data-message-id]').length),
    pendingTurn: feedbackClient.pendingTurn,
    viewport: { width: count(window.innerWidth), height: count(window.innerHeight) },
    ...(/^[A-Za-z0-9-]{1,35}$/.test(locale) ? { locale } : {}),
    ...(/^[A-Za-z0-9_+/-]{1,64}$/.test(timeZone) ? { timeZone } : {}),
    clockOffsetMs:
      clockOffsetMs === null ? null : Math.min(1e12, Math.max(-1e12, Math.round(clockOffsetMs))),
    uptimeMs: age(performance.now()),
  };
}
