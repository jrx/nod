import { randomUUID } from 'node:crypto';

type Parent = {
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
};
type Answer = Record<string, unknown> & { error?: unknown };

export function parentRequests(
  type: string,
  answerMs: number,
  unanswered: string,
  abortable = true,
) {
  const parent = (process as NodeJS.Process & { parentPort?: Parent }).parentPort;
  if (!parent) return undefined;
  const waiting = new Map<string, (answer: Answer) => void>();
  parent.on('message', ({ data }) => {
    const answer = data as (Answer & { type?: unknown; id?: unknown }) | null;
    if (answer?.type !== `${type}-result` || typeof answer.id !== 'string') return;
    waiting.get(answer.id)?.(answer);
    waiting.delete(answer.id);
  });
  return (payload: Record<string, unknown>, signal?: AbortSignal) =>
    new Promise<Answer>((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const id = randomUUID();
      const done = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        waiting.delete(id);
      };
      const timer = setTimeout(() => {
        done();
        reject(new Error(unanswered));
      }, answerMs);
      const abort = () => {
        done();
        reject(signal!.reason);
      };
      if (abortable) signal?.addEventListener('abort', abort, { once: true });
      waiting.set(id, (answer) => {
        done();
        if (typeof answer.error === 'string') reject(new Error(answer.error));
        else resolve(answer);
      });
      try {
        parent.postMessage({ type, id, ...payload });
      } catch (error) {
        done();
        reject(error);
      }
    });
}
