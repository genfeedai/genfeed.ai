import {
  isRetryableSystemRunError,
  toTerminalSystemRunError,
} from '@workers/processors/api/collections/workflows/services/system-run-retry.util';
import { UnrecoverableError } from 'bullmq';
import { describe, expect, it } from 'vitest';

describe('isRetryableSystemRunError', () => {
  it.each([
    'connect ECONNREFUSED 10.0.0.1:6379',
    'read ECONNRESET',
    'Nodes failed: infer: upstream 503',
    'Nodes failed: render: request timed out',
    'Rate limit exceeded, retry later',
    'HTTP 429 Too Many Requests',
    'socket hang up',
    'fetch failed',
    'Invalid `prisma.workflowExecution.update()` invocation: P2034 write conflict',
    "Can't reach database server (P1001)",
    'deadlock detected',
  ])('retries a transient failure: %s', (message) => {
    expect(isRetryableSystemRunError(new Error(message))).toBe(true);
  });

  it.each([
    'System workflow clip.factory failed',
    'Unknown system workflow: nope.nope',
    'Nodes failed: publish: Forbidden',
    'Nodes failed: load: Brand brand-1 not found',
    'System workflow x was cancelled',
    'Invalid request: 4000 characters is too long',
  ])('does not retry a deterministic failure: %s', (message) => {
    expect(isRetryableSystemRunError(new Error(message))).toBe(false);
  });

  it('never retries an action-contract failure, even with a transient-looking word in it', () => {
    expect(
      isRetryableSystemRunError(
        new Error(
          'Nodes failed: finalize: Action contract input validation failed [action=a workflow=w version=v run=r node=n] $.timeout: must be number',
        ),
      ),
    ).toBe(false);
  });

  it('honors an explicit isRetryable flag over message matching', () => {
    expect(
      isRetryableSystemRunError(
        Object.assign(new Error('bad input'), { isRetryable: true }),
      ),
    ).toBe(true);
    expect(
      isRetryableSystemRunError(
        Object.assign(new Error('ETIMEDOUT'), { isRetryable: false }),
      ),
    ).toBe(false);
  });

  it('reads the error code when the message carries no hint', () => {
    expect(
      isRetryableSystemRunError(
        Object.assign(new Error('boom'), { code: 'ECONNRESET' }),
      ),
    ).toBe(true);
  });

  it('never retries an UnrecoverableError', () => {
    expect(isRetryableSystemRunError(new UnrecoverableError('ETIMEDOUT'))).toBe(
      false,
    );
  });
});

describe('toTerminalSystemRunError', () => {
  it('wraps a plain error, keeping its message, stack and cause', () => {
    const original = new Error('not found');
    const terminal = toTerminalSystemRunError(original);

    expect(terminal).toBeInstanceOf(UnrecoverableError);
    expect(terminal.message).toBe('not found');
    expect(terminal.stack).toBe(original.stack);
    expect(terminal.cause).toBe(original);
  });

  it('returns an UnrecoverableError unchanged', () => {
    const terminal = new UnrecoverableError('x');
    expect(toTerminalSystemRunError(terminal)).toBe(terminal);
  });
});
