import { describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('./logger.service', () => ({ logger }));

import { deferredLogger } from './deferred-logger';

describe('deferredLogger', () => {
  it('forwards every call to the same level of the full logger', async () => {
    const failure = new Error('boom');

    deferredLogger.error('first', { error: failure });
    deferredLogger.warn('second');
    deferredLogger.info('third', { id: 1 });
    deferredLogger.debug('fourth');

    await vi.waitFor(() => expect(logger.debug).toHaveBeenCalledTimes(1));
    expect(logger.error).toHaveBeenCalledWith('first', { error: failure });
    expect(logger.warn).toHaveBeenCalledWith('second', undefined);
    expect(logger.info).toHaveBeenCalledWith('third', { id: 1 });
    expect(logger.debug).toHaveBeenCalledWith('fourth', undefined);
  });
});
