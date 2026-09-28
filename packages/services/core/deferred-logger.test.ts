import { describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ error: vi.fn() }));

vi.mock('./logger.service', () => ({ logger }));

import { logErrorDeferred } from './deferred-logger';

describe('logErrorDeferred', () => {
  it('forwards every report to the full logger once it has loaded', async () => {
    const failure = new Error('boom');

    logErrorDeferred('first', { error: failure });
    logErrorDeferred('second');

    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledTimes(2));
    expect(logger.error).toHaveBeenNthCalledWith(1, 'first', {
      error: failure,
    });
    expect(logger.error).toHaveBeenNthCalledWith(2, 'second', undefined);
  });
});
