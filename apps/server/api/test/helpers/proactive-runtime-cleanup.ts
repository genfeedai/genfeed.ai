export async function runOwnedRuntimeCleanup(
  actions: (() => Promise<unknown>)[],
): Promise<void> {
  const failures: unknown[] = [];
  for (const action of actions) {
    try {
      await action();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'Owned proactive runtime cleanup failed',
    );
  }
}
