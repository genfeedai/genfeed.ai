import { type SpawnSyncReturns, spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

/** Keep child processes below the 180s Vitest timeout on each contract. */
export const CONTRACT_CHILD_TIMEOUT_MS = 150_000;

type ContractProcessResult = Pick<
  SpawnSyncReturns<string>,
  'error' | 'signal' | 'status' | 'stderr' | 'stdout'
>;

export type ExecutableContractDiagnostic = {
  schemaVersion: 1;
  kind: 'executable_contract_diagnostic';
  contract: string;
  command: string[];
  wallMs: number;
  disposition:
    | 'passed'
    | 'timed_out'
    | 'startup_error'
    | 'signaled'
    | 'nonzero_exit'
    | 'unknown_termination'
    | 'invocation_error';
  exitCode: number | null;
  signal: SpawnSyncReturns<string>['signal'];
  platform: NodeJS.Platform;
  childMaxRssKiB: null;
  childMaxRssUnavailableReason:
    | 'node_spawn_sync_does_not_expose_child_usage'
    | 'unsupported_platform';
};

function classifyContractResult(
  result: ContractProcessResult | null,
): ExecutableContractDiagnostic['disposition'] {
  if (result === null) return 'invocation_error';
  if (result.error) {
    return 'code' in result.error && result.error.code === 'ETIMEDOUT'
      ? 'timed_out'
      : 'startup_error';
  }
  if (result.status === null) {
    return result.signal !== null ? 'signaled' : 'unknown_termination';
  }
  return result.status !== 0 ? 'nonzero_exit' : 'passed';
}

export function buildContractDiagnostic(
  command: readonly string[],
  result: ContractProcessResult | null,
  wallMs: number,
  platform: NodeJS.Platform,
  contractName?: string,
): ExecutableContractDiagnostic {
  if (!Number.isFinite(wallMs) || wallMs < 0) {
    throw new RangeError('Contract wall time must be finite and nonnegative');
  }
  return {
    childMaxRssKiB: null,
    childMaxRssUnavailableReason:
      platform === 'linux'
        ? 'node_spawn_sync_does_not_expose_child_usage'
        : 'unsupported_platform',
    command: [...command],
    contract: contractName ?? command.join(' '),
    disposition: classifyContractResult(result),
    exitCode: result?.status ?? null,
    kind: 'executable_contract_diagnostic',
    platform,
    schemaVersion: 1,
    signal: result?.signal ?? null,
    wallMs,
  };
}

function readContractClock(): number | undefined {
  try {
    return performance.now();
  } catch {
    return undefined;
  }
}

function emitContractDiagnostic(
  command: readonly string[],
  result: ContractProcessResult | null,
  startedAt: number | undefined,
  completedAt: number | undefined,
  contractName?: string,
): void {
  try {
    if (startedAt === undefined || completedAt === undefined) return;
    const diagnostic = buildContractDiagnostic(
      command,
      result,
      completedAt - startedAt,
      process.platform,
      contractName,
    );
    console.log(`[ExecutableContractDiagnostic] ${JSON.stringify(diagnostic)}`);
  } catch {
    // Diagnostics must never replace the original subprocess gate outcome.
  }
}

export function formatContractFailure(
  command: readonly string[],
  result: Pick<
    SpawnSyncReturns<string>,
    'error' | 'signal' | 'status' | 'stderr' | 'stdout'
  >,
): string {
  const commandLabel = command.join(' ');

  if (
    result.error &&
    'code' in result.error &&
    result.error.code === 'ETIMEDOUT'
  ) {
    return `${commandLabel} timed out (${result.signal ?? 'no signal'}) after ${String(CONTRACT_CHILD_TIMEOUT_MS)}ms\n${result.stdout ?? ''}${result.stderr ?? ''}`;
  }

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
  contractName?: string,
): void {
  const [bin, ...args] = command;
  let result: SpawnSyncReturns<string>;
  const startedAt = readContractClock();
  try {
    result = spawnSync(bin, args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: process.env,
      timeout: CONTRACT_CHILD_TIMEOUT_MS,
    });
  } catch (error) {
    const completedAt = readContractClock();
    emitContractDiagnostic(command, null, startedAt, completedAt, contractName);
    throw error;
  }
  const completedAt = readContractClock();
  emitContractDiagnostic(command, result, startedAt, completedAt, contractName);
  assertContractResult(command, result);
}
