import { afterEach, describe, expect, it, vi } from 'vitest';

const captureExtensionError = vi.hoisted(() => vi.fn());

vi.mock('~services/error-tracking.service', () => ({
  captureExtensionError,
}));

const originalEnv = { ...process.env };

async function importLogger(nodeEnv: string) {
  vi.resetModules();
  process.env = { ...originalEnv, NODE_ENV: nodeEnv };
  return import('~utils/logger.util');
}

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('browser extension logger', () => {
  it('writes to the console in development and skips error tracking', async () => {
    const debug = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { logger } = await importLogger('development');

    logger.debug('d');
    logger.info('i');
    logger.log('l');
    logger.warn('w');
    logger.error('boom', new Error('x'), { runId: '1' });

    expect(debug).toHaveBeenCalledWith('[Genfeed Debug]', 'd');
    expect(info).toHaveBeenCalledWith('[Genfeed]', 'i');
    expect(log).toHaveBeenCalledWith('[Genfeed]', 'l');
    expect(warn).toHaveBeenCalledWith('[Genfeed]', 'w');
    expect(error).toHaveBeenCalledWith(
      '[Genfeed Error]',
      'boom',
      expect.any(Error),
      { runId: '1' },
    );
    expect(captureExtensionError).not.toHaveBeenCalled();
  });

  it('forwards production errors to tracking and stays silent otherwise', async () => {
    const debug = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const { logger } = await importLogger('production');

    logger.debug('d');
    logger.info('i');
    logger.log('l');
    logger.warn('w');
    logger.error('boom', new Error('x'), { runId: '1' });

    expect(debug).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(captureExtensionError).toHaveBeenCalledWith(
      'boom',
      expect.any(Error),
      {
        runId: '1',
      },
    );
  });
});
