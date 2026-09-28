import { afterEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('./logger.service');
  vi.resetModules();
  vi.clearAllMocks();
});

describe('deferredLogger', () => {
  it('forwards every call to the same level of the full logger', async () => {
    vi.doMock('./logger.service', () => ({ logger }));
    const { deferredLogger } = await import('./deferred-logger');
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

  it('keeps the report on the console when the logger fails to load, then retries', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    let loads = 0;
    vi.doMock('./logger.service', () => {
      loads += 1;
      if (loads === 1) {
        throw new Error('Failed to fetch dynamically imported module');
      }
      return { logger };
    });
    const { deferredLogger } = await import('./deferred-logger');
    const failure = new Error('boom');

    deferredLogger.error('while offline', { error: failure });
    await vi.waitFor(() =>
      expect(consoleError).toHaveBeenCalledWith('while offline', {
        error: failure,
      }),
    );
    expect(logger.error).not.toHaveBeenCalled();

    deferredLogger.error('back online');
    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith('back online', undefined),
    );
  });
});
