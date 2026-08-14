import { spawnSync } from 'node:child_process';

export const PORTLESS_PRUNE_ARGS = ['prune'] as const;

type PruneResult = {
  error?: Error;
  status?: number | null;
};

type PruneRunner = (args: readonly string[]) => PruneResult;

export function shouldPruneBeforePortlessRun(isInner: boolean): boolean {
  return !isInner;
}

export function pruneStalePortlessSessions(
  run: PruneRunner = (args) =>
    spawnSync('portless', [...args], {
      env: process.env,
      stdio: 'inherit',
    }),
): void {
  const result = run(PORTLESS_PRUNE_ARGS);
  if (result.error) {
    console.warn(
      `portless prune skipped: ${result.error.message}. Stale foreign next-server processes may still be holding CPU.`,
    );
  }
}
