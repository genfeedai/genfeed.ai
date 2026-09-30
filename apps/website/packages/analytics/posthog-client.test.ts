import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  posthogCapture: vi.fn(),
  posthogImport: vi.fn(),
  posthogInit: vi.fn(),
}));

vi.mock('posthog-js', () => {
  mocks.posthogImport();
  return {
    default: {
      capture: mocks.posthogCapture,
      init: mocks.posthogInit,
    },
  };
});

type WebsitePosthogClientModule = typeof import('./posthog-client');

let loadedClient: WebsitePosthogClientModule | null = null;

/**
 * The module captures NEXT_PUBLIC_POSTHOG_KEY at import time, so every case
 * re-imports after stubbing env to exercise the intended enabled/disabled
 * state.
 */
async function loadClient(): Promise<WebsitePosthogClientModule> {
  vi.resetModules();
  loadedClient = await import('./posthog-client');
  return loadedClient;
}

/**
 * Flush the dynamic import()/microtask queue used by initWebsiteAnalytics.
 *
 * The SDK load is scheduled through `requestIdleCallback` so it stays off the
 * pre-LCP critical path. jsdom does not implement it, so `beforeEach` stubs it
 * to run inline — the scheduling itself is covered by its own case below.
 */
async function flushInit(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Run scheduled idle work synchronously, the way a fully idle browser would. */
function stubImmediateIdleCallback(): void {
  vi.stubGlobal('requestIdleCallback', (callback: () => void): number => {
    callback();
    return 1;
  });
}

function dispatchTrackedCta(
  trackingName: string,
  trackingData?: Record<string, string>,
): void {
  window.dispatchEvent(
    new CustomEvent('genfeed:marketing:button-click', {
      detail: { trackingData, trackingName },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  stubImmediateIdleCallback();
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_testkey');
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Unregister the window listener so a stale module instance cannot keep
  // capturing into the shared mocks across cases.
  loadedClient?.__resetWebsiteAnalyticsForTests();
  loadedClient = null;
});

describe('isWebsiteAnalyticsEnabled', () => {
  it('is enabled when a PostHog key is baked into the build', async () => {
    const client = await loadClient();
    expect(client.isWebsiteAnalyticsEnabled()).toBe(true);
  });

  it.each([
    ['a placeholder', '-'],
    ['an empty value', ''],
    ['a non-PostHog value', 'project_123'],
  ])('is disabled when the key is %s', async (_label, key) => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', key);
    const client = await loadClient();
    expect(client.isWebsiteAnalyticsEnabled()).toBe(false);
  });
});

describe('initWebsiteAnalytics', () => {
  it('schedules the SDK load for idle time rather than the critical path', async () => {
    const idleCallbacks: Array<() => void> = [];
    vi.stubGlobal('requestIdleCallback', (callback: () => void): number => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });

    const client = await loadClient();
    client.initWebsiteAnalytics();
    await flushInit();

    // Nothing may load before the browser reports idle: `instrumentation-client`
    // runs inside the initial client bundle, so an eager import would put the
    // SDK request in the dependency graph Lighthouse simulates for LCP.
    expect(mocks.posthogInit).not.toHaveBeenCalled();
    expect(idleCallbacks).toHaveLength(1);

    for (const callback of idleCallbacks) {
      callback();
    }
    await flushInit();

    expect(mocks.posthogInit).toHaveBeenCalledTimes(1);
  });

  it('falls back to a timer when requestIdleCallback is unavailable', async () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    vi.useFakeTimers();

    try {
      const client = await loadClient();
      client.initWebsiteAnalytics();

      expect(mocks.posthogInit).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1500);

      expect(mocks.posthogInit).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('buffers CTA clicks fired before the deferred SDK finishes loading', async () => {
    const idleCallbacks: Array<() => void> = [];
    vi.stubGlobal('requestIdleCallback', (callback: () => void): number => {
      idleCallbacks.push(callback);
      return idleCallbacks.length;
    });

    const client = await loadClient();
    client.initWebsiteAnalytics();

    // The CTA listener is attached synchronously, so a hero click during the
    // deferral window is queued instead of dropped.
    dispatchTrackedCta('hero_primary');

    for (const callback of idleCallbacks) {
      callback();
    }
    await flushInit();

    expect(mocks.posthogCapture).toHaveBeenCalledWith(
      'cta_click',
      expect.objectContaining({ trackingName: 'hero_primary' }),
    );
  });

  it('constructs a cookieless, anonymous PostHog client', async () => {
    const client = await loadClient();
    client.initWebsiteAnalytics();
    await flushInit();

    expect(mocks.posthogInit).toHaveBeenCalledTimes(1);
    expect(mocks.posthogInit).toHaveBeenCalledWith(
      'phc_testkey',
      expect.objectContaining({
        api_host: 'https://eu.i.posthog.com',
        autocapture: {
          capture_copied_text: false,
          dom_event_allowlist: ['click'],
          element_allowlist: ['a', 'button'],
        },
        capture_pageview: 'history_change',
        capture_pageleave: true,
        cookieless_mode: 'always',
        defaults: '2026-05-30',
        disable_session_recording: true,
        person_profiles: 'never',
      }),
    );
  });

  it.each([
    ['a placeholder', '-'],
    ['empty', ''],
    ['a non-PostHog value', 'project_123'],
  ])('never loads the SDK when the key is %s', async (_label, key) => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', key);
    const client = await loadClient();
    client.initWebsiteAnalytics();
    await flushInit();

    expect(mocks.posthogImport).not.toHaveBeenCalled();
    expect(mocks.posthogInit).not.toHaveBeenCalled();
  });

  it('initialises once across repeated calls', async () => {
    const client = await loadClient();
    client.initWebsiteAnalytics();
    client.initWebsiteAnalytics();
    await flushInit();

    expect(mocks.posthogInit).toHaveBeenCalledTimes(1);
  });
});

describe('tracked CTA bridge', () => {
  it('captures cta_click plus the derived conversion event', async () => {
    const client = await loadClient();
    client.initWebsiteAnalytics();
    await flushInit();

    dispatchTrackedCta('hero_cta_click', { action: 'start_free_hero' });

    expect(mocks.posthogCapture).toHaveBeenCalledWith('cta_click', {
      action: 'start_free_hero',
      trackingName: 'hero_cta_click',
    });
    expect(mocks.posthogCapture).toHaveBeenCalledWith('start_signup', {
      action: 'start_free_hero',
      trackingName: 'hero_cta_click',
    });
  });

  it('buffers CTA clicks fired before the SDK import resolves', async () => {
    const client = await loadClient();
    client.initWebsiteAnalytics();
    // No flush yet: the dynamic import has not resolved.
    dispatchTrackedCta('hero_cta_click', { action: 'book_demo_hero' });
    expect(mocks.posthogCapture).not.toHaveBeenCalled();

    await flushInit();

    expect(mocks.posthogCapture).toHaveBeenCalledWith('cta_click', {
      action: 'book_demo_hero',
      trackingName: 'hero_cta_click',
    });
    expect(mocks.posthogCapture).toHaveBeenCalledWith('book_call', {
      action: 'book_demo_hero',
      trackingName: 'hero_cta_click',
    });
  });

  it('ignores events without a trackingName', async () => {
    const client = await loadClient();
    client.initWebsiteAnalytics();
    await flushInit();

    window.dispatchEvent(
      new CustomEvent('genfeed:marketing:button-click', { detail: {} }),
    );

    expect(mocks.posthogCapture).not.toHaveBeenCalled();
  });

  it('captures nothing when analytics is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    const client = await loadClient();
    client.initWebsiteAnalytics();
    await flushInit();

    dispatchTrackedCta('hero_cta_click', { action: 'start_free_hero' });

    expect(mocks.posthogCapture).not.toHaveBeenCalled();
  });
});
