import { describe, expect, it } from 'vitest';
import {
  assertContractResult,
  CONTRACT_CHILD_TIMEOUT_MS,
  formatContractFailure,
} from './executable-contract-runner';

const command = ['bun', 'run', 'check:example'] as const;

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

  it('throws the process error before evaluating status', () => {
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
