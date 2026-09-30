import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureWorkflowLogger, getWorkflowLogger } from './executionLogger';

describe('executionLogger', () => {
  afterEach(() => {
    // Reset to the no-op default so tests don't leak a logger into each other.
    configureWorkflowLogger(undefined);
  });

  it('defaults to a no-op logger that never throws', () => {
    expect(() =>
      getWorkflowLogger().error('boom', { context: 'test' }),
    ).not.toThrow();
  });

  it('routes error() to the configured logger with message + meta', () => {
    const error = vi.fn();
    configureWorkflowLogger({ error });

    const meta = { context: 'ExecutionStore', error: new Error('x') };
    getWorkflowLogger().error('SSE connection error', meta);

    expect(error).toHaveBeenCalledWith('SSE connection error', meta);
  });

  it('reverts to the no-op logger when reconfigured with undefined', () => {
    const error = vi.fn();
    configureWorkflowLogger({ error });
    configureWorkflowLogger(undefined);

    getWorkflowLogger().error('ignored');

    expect(error).not.toHaveBeenCalled();
  });
});
