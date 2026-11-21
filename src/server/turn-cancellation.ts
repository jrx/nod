const operations = new Map<string, Set<AbortController>>();

export async function withTurnCancellation<T>(
  turnId: string,
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const active = operations.get(turnId) ?? new Set<AbortController>();
  operations.set(turnId, active);
  active.add(controller);
  try {
    return await operation(controller.signal);
  } finally {
    active.delete(controller);
    if (!active.size) operations.delete(turnId);
  }
}

export function cancelTurnOperations(turnIds: Iterable<string> = operations.keys()) {
  for (const id of turnIds) for (const controller of operations.get(id) ?? []) controller.abort();
}
