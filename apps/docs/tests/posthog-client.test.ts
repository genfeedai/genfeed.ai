import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  posthogImport: vi.fn(),
  posthogInit: vi.fn(),
}));

vi.mock('posthog-js', () => {
  mocks.posthogImport();
  return { default: { init: mocks.posthogInit } };
});

async function loadInstrumentationClient(): Promise<void> {
  vi.resetModules();
  await import('../instrumentation-client');
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  // The SDK load is scheduled through `requestIdleCallback` so it stays off
  // the pre-LCP critical path. The stubbed window has to provide it — without
  // it the module falls back to `window.setTimeout`, which a bare object does
  // not have. Running the callback inline models a fully idle browser.
  vi.stubGlobal('window', {
    requestIdleCallback: (callback: () => void): number => {
      callback();
      return 1;
    },
  });
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test123');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('docs PostHog client', () => {
  it('imports and initializes PostHog for a valid project token', async () => {
    await loadInstrumentationClient();

    expect(mocks.posthogImport).toHaveBeenCalledTimes(1);
    expect(mocks.posthogInit).toHaveBeenCalledWith(
      'phc_test123',
      expect.objectContaining({ capture_pageview: 'history_change' }),
    );
  });

  it.each([
    ['a placeholder', '-'],
    ['empty', ''],
    ['a non-PostHog value', 'project_123'],
  ])('never imports PostHog when the key is %s', async (_label, key) => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', key);
    await loadInstrumentationClient();

    expect(mocks.posthogImport).not.toHaveBeenCalled();
    expect(mocks.posthogInit).not.toHaveBeenCalled();
  });
});
