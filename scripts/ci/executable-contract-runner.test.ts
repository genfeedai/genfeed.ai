import type {
  SpawnSyncOptionsWithStringEncoding,
  SpawnSyncReturns,
} from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertContractResult,
  buildContractDiagnostic,
  CONTRACT_CHILD_TIMEOUT_MS,
  formatContractFailure,
  runContract,
} from './executable-contract-runner';

const mocks = vi.hoisted(() => ({
  now: vi.fn<() => number>(),
  spawnSync:
    vi.fn<
      (
        command: string,
        args: readonly string[],
        options: SpawnSyncOptionsWithStringEncoding,
      ) => SpawnSyncReturns<string>
    >(),
}));

vi.mock('node:child_process', () => ({ spawnSync: mocks.spawnSync }));
vi.mock('node:perf_hooks', () => ({ performance: { now: mocks.now } }));

const command = ['bun', 'run', 'check:example'] as const;

function processResult(
  overrides: Partial<SpawnSyncReturns<string>> = {},
): SpawnSyncReturns<string> {
  return {
    output: [null, '', ''],
    pid: 1,
    signal: null,
    status: 0,
    stderr: '',
    stdout: '',
    ...overrides,
  };
}

const timeoutResult = processResult({
  error: Object.assign(new Error('spawnSync bun ETIMEDOUT'), {
    code: 'ETIMEDOUT',
  }),
  signal: 'SIGTERM',
  status: null,
  stderr: 'workspace scan pending',
  stdout: 'scan started',
});
const startupResult = processResult({
  error: Object.assign(new Error('spawn bun ENOENT'), { code: 'ENOENT' }),
  status: null,
});
const nonzeroResult = processResult({
  status: 2,
  stderr: 'stderr line',
  stdout: 'stdout line',
});

describe('executable contract runner', () => {
  it('reports process-creation errors before a null exit status', () => {
    const message = formatContractFailure(command, {
      error: Object.assign(new Error('spawn bun ENOENT'), { code: 'ENOENT' }),
      signal: null,
      status: null,
      stderr: '',
      stdout: '',
    });

    expect(message).toContain('bun run check:example failed to start');
    expect(message).toContain('spawn bun ENOENT');
    expect(message).not.toContain('exited null');
  });

  it('reports a bounded timeout when the child never exits', () => {
    const message = formatContractFailure(command, {
      error: undefined,
      signal: 'SIGTERM',
      status: null,
      stderr: 'still running',
      stdout: '',
    });

    expect(message).toContain('timed out or was signaled (SIGTERM)');
    expect(message).toContain(String(CONTRACT_CHILD_TIMEOUT_MS));
    expect(message).toContain('still running');
  });

  it('keeps stdout and stderr on a non-zero exit', () => {
    const message = formatContractFailure(command, {
      error: undefined,
      signal: null,
      status: 2,
      stderr: 'stderr line',
      stdout: 'stdout line',
    });

    expect(message).toContain('exited 2');
    expect(message).toContain('stdout line');
    expect(message).toContain('stderr line');
  });

  it('classifies spawnSync ETIMEDOUT and retains its diagnostics', () => {
    const result = {
      error: Object.assign(new Error('spawnSync bun ETIMEDOUT'), {
        code: 'ETIMEDOUT',
      }),
      signal: 'SIGTERM' as const,
      status: null,
      stderr: 'workspace scan pending',
      stdout: 'scan started',
    };
    const message = formatContractFailure(command, result);
    expect(message).toContain(
      `timed out (SIGTERM) after ${CONTRACT_CHILD_TIMEOUT_MS}ms`,
    );
    expect(message).toContain('scan started');
    expect(message).toContain('workspace scan pending');
    expect(message).not.toContain('failed to start');
    expect(() => assertContractResult(command, result)).toThrow(/timed out/);
  });

  it('throws other process errors before evaluating status', () => {
    expect(() =>
      assertContractResult(command, {
        error: new Error('ETIMEDOUT'),
        signal: null,
        status: null,
        stderr: '',
        stdout: '',
      }),
    ).toThrow(/failed to start: ETIMEDOUT/);
  });
});

describe('executable contract diagnostics', () => {
  it.each([
    { disposition: 'passed', result: processResult() },
    { disposition: 'nonzero_exit', result: nonzeroResult },
    { disposition: 'timed_out', result: timeoutResult },
    {
      disposition: 'timed_out',
      result: processResult({ ...timeoutResult, status: 2 }),
    },
    { disposition: 'startup_error', result: startupResult },
    {
      disposition: 'startup_error',
      result: processResult({ error: new Error('ETIMEDOUT'), status: null }),
    },
    {
      disposition: 'signaled',
      result: processResult({ signal: 'SIGTERM', status: null }),
    },
    {
      disposition: 'unknown_termination',
      result: processResult({ status: null }),
    },
    // A populated signal on exit zero does not change the existing assertion.
    {
      disposition: 'passed',
      result: processResult({ signal: 'SIGTERM' }),
    },
  ])(
    'records $disposition without interpreting child output',
    ({ disposition, result }) => {
      for (const platform of ['linux', 'darwin'] as const) {
        const diagnostic = buildContractDiagnostic(
          command,
          result,
          12.375,
          platform,
          'example contract',
        );
        expect(diagnostic).toEqual({
          childMaxRssKiB: null,
          childMaxRssUnavailableReason:
            platform === 'linux'
              ? 'node_spawn_sync_does_not_expose_child_usage'
              : 'unsupported_platform',
          command: [...command],
          contract: 'example contract',
          disposition,
          exitCode: result.status,
          kind: 'executable_contract_diagnostic',
          platform,
          schemaVersion: 1,
          signal: result.signal,
          wallMs: 12.375,
        });
        expect(diagnostic.command).not.toBe(command);
      }
    },
  );

  it('uses the original argv label when no stable name is supplied', () => {
    expect(buildContractDiagnostic(command, null, 1, 'linux')).toMatchObject({
      contract: command.join(' '),
      disposition: 'invocation_error',
      exitCode: null,
      signal: null,
    });
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    'rejects unavailable or invalid wall time %s',
    (wallMs) => {
      expect(() =>
        buildContractDiagnostic(command, processResult(), wallMs, 'linux'),
      ).toThrow(RangeError);
    },
  );
});

describe('runContract diagnostic wiring', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.spawnSync.mockReturnValue(processResult());
    mocks.now.mockReturnValueOnce(100).mockReturnValueOnce(112.375);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the direct invocation and emits exactly one separate diagnostic', () => {
    runContract(command, '/repository', 'example contract');

    expect(mocks.spawnSync).toHaveBeenCalledExactlyOnceWith(
      'bun',
      ['run', 'check:example'],
      {
        cwd: '/repository',
        encoding: 'utf8',
        env: process.env,
        timeout: CONTRACT_CHILD_TIMEOUT_MS,
      },
    );
    expect(mocks.spawnSync.mock.calls[0]?.[2]?.env).toBe(process.env);
    expect(console.log).toHaveBeenCalledExactlyOnceWith(
      `[ExecutableContractDiagnostic] ${JSON.stringify(
        buildContractDiagnostic(
          command,
          processResult(),
          12.375,
          process.platform,
          'example contract',
        ),
      )}`,
    );
    expect(mocks.now).toHaveBeenCalledTimes(2);
  });

  it.each([timeoutResult, nonzeroResult, startupResult])(
    'emits before retaining the original returned failure: %j',
    (result) => {
      mocks.spawnSync.mockReturnValue(result);

      expect(() => runContract(command, '/repository')).toThrow(
        formatContractFailure(command, result),
      );
      expect(console.log).toHaveBeenCalledTimes(1);
      expect(mocks.spawnSync).toHaveBeenCalledTimes(1);
    },
  );

  it('emits invocation_error and rethrows the exact synchronous thrown value', () => {
    const original = { message: 'original invocation failure' };
    mocks.spawnSync.mockImplementation(() => {
      throw original;
    });
    let caught: unknown;
    try {
      runContract(command, '/repository');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(original);
    expect(mocks.spawnSync).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledExactlyOnceWith(
      `[ExecutableContractDiagnostic] ${JSON.stringify(buildContractDiagnostic(command, null, 12.375, process.platform))}`,
    );
  });

  it.each([processResult(), nonzeroResult])(
    'preserves the gate when the diagnostic sink or serializer fails: %j',
    (result) => {
      for (const failure of ['sink', 'serializer'] as const) {
        mocks.spawnSync.mockClear().mockReturnValue(result);
        mocks.now
          .mockReset()
          .mockReturnValueOnce(100)
          .mockReturnValueOnce(112.375);
        const diagnosticError = new Error('diagnostic unavailable');
        if (failure === 'sink') {
          vi.mocked(console.log).mockImplementation(() => {
            throw diagnosticError;
          });
        } else {
          vi.mocked(console.log).mockImplementation(() => {});
          vi.spyOn(JSON, 'stringify').mockImplementation(() => {
            throw diagnosticError;
          });
        }
        let caught: unknown;
        try {
          runContract(command, '/repository');
        } catch (error) {
          caught = error;
        } finally {
          if (failure === 'serializer') vi.mocked(JSON.stringify).mockRestore();
        }
        if (result.status === 0) {
          expect(caught).toBeUndefined();
        } else {
          expect(caught).toBeInstanceOf(Error);
          expect((caught as Error).message).toBe(
            formatContractFailure(command, result),
          );
        }
        expect(mocks.spawnSync).toHaveBeenCalledTimes(1);
      }
    },
  );

  it('captures only the spawn interval before diagnostic emission', () => {
    vi.mocked(console.log).mockImplementation(() => {
      mocks.now.mockReturnValue(999_999);
    });
    runContract(command, '/repository');
    expect(console.log).toHaveBeenCalledExactlyOnceWith(
      `[ExecutableContractDiagnostic] ${JSON.stringify(buildContractDiagnostic(command, processResult(), 12.375, process.platform))}`,
    );
    expect(mocks.now).toHaveBeenCalledTimes(2);
  });

  it.each([processResult(), nonzeroResult])(
    'omits unavailable clock diagnostics without changing execution: %j',
    (result) => {
      for (const failure of ['throw', 'nonfinite', 'negative'] as const) {
        mocks.spawnSync.mockClear().mockReturnValue(result);
        mocks.now.mockReset();
        if (failure === 'throw') {
          mocks.now.mockImplementation(() => {
            throw new Error('clock unavailable');
          });
        } else {
          mocks.now
            .mockReturnValueOnce(100)
            .mockReturnValueOnce(failure === 'nonfinite' ? Number.NaN : 99);
        }
        if (result.status === 0) {
          expect(() => runContract(command, '/repository')).not.toThrow();
        } else {
          expect(() => runContract(command, '/repository')).toThrow(
            formatContractFailure(command, result),
          );
        }
        expect(mocks.spawnSync).toHaveBeenCalledTimes(1);
        expect(console.log).not.toHaveBeenCalled();
      }
    },
  );
});
