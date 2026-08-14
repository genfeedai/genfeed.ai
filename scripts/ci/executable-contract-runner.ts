import { type SpawnSyncReturns, spawnSync } from 'node:child_process';

/** Keep child processes below the 180s Vitest timeout on each contract. */
export const CONTRACT_CHILD_TIMEOUT_MS = 150_000;

export function formatContractFailure(
  command: readonly string[],
  result: Pick<
    SpawnSyncReturns<string>,
    'error' | 'signal' | 'status' | 'stderr' | 'stdout'
  >,
): string {
  const commandLabel = command.join(' ');

  if (result.error) {
    return `${commandLabel} failed to start: ${result.error.message}`;
  }

  if (result.status === null) {
    return `${commandLabel} timed out or was signaled (${result.signal ?? 'no signal'}) after ${String(CONTRACT_CHILD_TIMEOUT_MS)}ms\n${result.stdout ?? ''}${result.stderr ?? ''}`;
  }

  return `${commandLabel} exited ${String(result.status)}\n${result.stdout ?? ''}${result.stderr ?? ''}`;
}

export function assertContractResult(
  command: readonly string[],
  result: Pick<
    SpawnSyncReturns<string>,
    'error' | 'signal' | 'status' | 'stderr' | 'stdout'
  >,
): void {
  if (result.error || result.status !== 0) {
    throw new Error(formatContractFailure(command, result));
  }
}

export function runContract(
  command: readonly string[],
  repositoryRoot: string,
): void {
  const [bin, ...args] = command;
  const result = spawnSync(bin, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: process.env,
    timeout: CONTRACT_CHILD_TIMEOUT_MS,
  });
  assertContractResult(command, result);
}
