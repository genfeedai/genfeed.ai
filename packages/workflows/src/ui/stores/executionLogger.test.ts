import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureWorkflowLogger, getWorkflowLogger } from './executionLogger';

describe('executionLogger', () => {
  afterEach(() => {
    // Reset to the no-op default so tests don't leak a logger into each other.
    configureWorkflowLogger(undefined);
  });

  it('routes error() to the configured logger with message + meta', () => {
    const error = vi.fn();
    configureWorkflowLogger({ error });

    const meta = { context: 'ExecutionStore', error: new Error('x') };
    getWorkflowLogger().error('SSE connection error', meta);

    expect(error).toHaveBeenCalledWith('SSE connection error', meta);
  });
});
