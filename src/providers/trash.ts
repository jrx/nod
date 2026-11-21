import type { Trash } from '../ports/trash.ts';
import { parentRequests } from './parent-port.ts';

export function desktopTrash(): Trash {
  const request = parentRequests('nod-trash', 60_000, 'The Trash did not answer.', false);
  return {
    ready: async () => Boolean(request),
    put: async (path, signal) => {
      if (!request) throw new Error('The Trash needs Nod desktop.');
      await request({ path }, signal);
    },
  };
}
