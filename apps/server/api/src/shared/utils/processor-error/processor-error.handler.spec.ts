import {
  createProcessorErrorHandler,
  ProcessorErrorHandler,
} from '@api/shared/utils/processor-error/processor-error.handler';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogger = {
  error: vi.fn(),
  info: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

vi.mock('@libs/logger/logger.service', () => ({
  LoggerService: {
    getInstance: vi.fn(() => mockLogger),
  },
}));

describe('ProcessorErrorHandler', () => {
  let handler: ProcessorErrorHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new ProcessorErrorHandler(mockLogger as never);
  });

  it('handles errors and returns error result', async () => {
    const mockJob = { id: 'job-1', name: 'test-job' };
    const result = await handler.handleError(new Error('Test error'), {
      job: mockJob as never,
      operation: 'test-operation',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Test error');
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('includes entityId in result when provided', async () => {
    const mockJob = { id: 'job-1', name: 'test-job' };
    const result = await handler.handleError(new Error('Error'), {
      entityId: 'entity-123',
      job: mockJob as never,
      operation: 'test-op',
    });

    expect(result.entityId).toBe('entity-123');
  });

  it('handles non-Error objects', async () => {
    const mockJob = { id: 'job-1', name: 'test-job' };
    const result = await handler.handleError('string error', {
      job: mockJob as never,
      operation: 'test-op',
    });

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('handles unknown errors gracefully', async () => {
    const mockJob = { id: 'job-1', name: 'test-job' };
    const result = await handler.handleError(null, {
      job: mockJob as never,
      operation: 'test-op',
    });

    expect(result.success).toBe(false);
  });
});

describe('createProcessorErrorHandler', () => {
  it('creates a ProcessorErrorHandler', () => {
    const handler = createProcessorErrorHandler(mockLogger as never);
    expect(handler).toBeInstanceOf(ProcessorErrorHandler);
  });
});
