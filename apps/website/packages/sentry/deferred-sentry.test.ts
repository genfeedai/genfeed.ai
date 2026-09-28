import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  init: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => sentry);

import { initDeferredSentry } from './deferred-sentry';

let runIdle: () => void = () => {};

beforeEach(() => {
  vi.stubGlobal('requestIdleCallback', (callback: () => void): number => {
    runIdle = callback;
    return 1;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  runIdle = () => {};
});

describe('initDeferredSentry', () => {
  it('waits for idle before loading the SDK', async () => {
    initDeferredSentry({ dsn: 'https://key@sentry.test/1' });

    expect(sentry.init).not.toHaveBeenCalled();

    runIdle();
    await vi.waitFor(() =>
      expect(sentry.init).toHaveBeenCalledWith({
        dsn: 'https://key@sentry.test/1',
      }),
    );
  });

  it('reports errors thrown before the SDK loaded, then stops holding them', async () => {
    initDeferredSentry({});
    const boot = new Error('boot failure');

    window.dispatchEvent(new ErrorEvent('error', { error: boot }));
    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), { reason: 'rejected' }),
    );

    runIdle();
    await vi.waitFor(() =>
      expect(sentry.captureException).toHaveBeenCalledTimes(2),
    );
    expect(sentry.captureException).toHaveBeenCalledWith(boot, {
      tags: { captured_before_sdk: 'true' },
    });
    expect(sentry.captureException).toHaveBeenCalledWith('rejected', {
      tags: { captured_before_sdk: 'true' },
    });

    // Sentry's own handlers own everything after init.
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('late') }));
    expect(sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it('ignores resource load failures, which are not script errors', async () => {
    initDeferredSentry({});

    window.dispatchEvent(new Event('error'));

    runIdle();
    await vi.waitFor(() => expect(sentry.init).toHaveBeenCalled());
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it('holds at most ten early errors', async () => {
    initDeferredSentry({});

    for (let index = 0; index < 15; index += 1) {
      window.dispatchEvent(
        new ErrorEvent('error', { error: new Error(`boot ${index}`) }),
      );
    }

    runIdle();
    await vi.waitFor(() =>
      expect(sentry.captureException).toHaveBeenCalledTimes(10),
    );
  });
});
