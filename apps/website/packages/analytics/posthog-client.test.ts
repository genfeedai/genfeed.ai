import type { BeforeSendFn, CaptureResult } from 'posthog-js';
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
        advanced_disable_flags: true,
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

describe('article preview analytics boundary', () => {
  it('drops preview events and strips bearer tokens from referrers', async () => {
    const client = await loadClient();
    client.initWebsiteAnalytics();
    await flushInit();
    const beforeSend = mocks.posthogInit.mock.calls[0][1].before_send;
    expect(
      beforeSend({
        event: '$pageview',
        properties: {
          $current_url: 'https://genfeed.ai/articles/test?previewToken=private',
        },
      }),
    ).toBeNull();
    window.history.replaceState({}, '', '/articles/test?previewToken=private');
    expect(beforeSend({ event: '$autocapture', properties: {} })).toBeNull();
    window.history.replaceState({}, '', '/articles/test');
    const result = beforeSend({
      event: '$pageview',
      properties: {
        $current_url: 'https://genfeed.ai/articles/test',
        $referrer:
          'https://genfeed.ai/articles/test?previewToken=private&source=review',
      },
    });
    expect(result.properties.$referrer).toBe(
      'https://genfeed.ai/articles/test?source=review',
    );
    expect(JSON.stringify(result)).not.toContain('private');
  });
});

describe('referral analytics boundary', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?ref=ABCDEF23JKMN');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  async function beforeSend(): Promise<BeforeSendFn> {
    const client = await loadClient();
    client.initWebsiteAnalytics();
    await flushInit();
    return mocks.posthogInit.mock.calls[0][1].before_send as BeforeSendFn;
  }

  it('scrubs page URLs, referrers and nested vitals without changing campaign data', async () => {
    const scrub = await beforeSend();
    const event: CaptureResult = {
      uuid: 'pageview-qa',
      event: '$web_vitals',
      properties: {
        $current_url: 'https://genfeed.ai/?ref=ABCDEF23JKMN&utm_source=qa',
        $referrer: 'https://genfeed.ai/pricing?ref=ABCDEF23JKMN&source=review',
        $initial_referrer: 'https://genfeed.ai/?REF=ABCDEF23JKMN',
        $web_vitals_FCP_event: {
          name: 'FCP',
          value: 42,
          url: 'https://genfeed.ai/?ref=ABCDEF23JKMN',
        },
        utm_source: 'qa',
        token: 'phc_testkey',
      },
    };
    const result = scrub(event);
    expect(result?.properties).toEqual({
      $current_url: 'https://genfeed.ai/?utm_source=qa',
      $referrer: 'https://genfeed.ai/pricing?source=review',
      $initial_referrer: 'https://genfeed.ai/',
      $web_vitals_FCP_event: {
        name: 'FCP',
        value: 42,
        url: 'https://genfeed.ai/',
      },
      utm_source: 'qa',
      token: 'phc_testkey',
    });
    expect(JSON.stringify(result)).not.toContain('ABCDEF23JKMN');
    expect(window.location.search).toBe('?ref=ABCDEF23JKMN');
  });

  it('scrubs autocapture attributes and person bags while preserving action identity', async () => {
    const scrub = await beforeSend();
    const original = { href: '/sign-up?ref=ABCDEF23JKMN&signup_landing=%2F' };
    const result = scrub({
      uuid: 'autocapture-qa',
      event: '$autocapture',
      properties: {
        ref: 'ABCDEF23JKMN',
        $elements: [original],
        $elements_chain: 'a:attr__href="/sign-up?ref=ABCDEF23JKMN"',
        trackingName: 'hero_primary',
      },
      $set: { ref: 'ABCDEF23JKMN', plan: 'free' },
      $set_once: {
        $initial_current_url: 'https://genfeed.ai/?ref=ABCDEF23JKMN',
      },
    });
    expect(result?.properties).toEqual({
      $elements: [{ href: '/sign-up?signup_landing=%2F' }],
      trackingName: 'hero_primary',
    });
    expect(result?.$set).toEqual({ plan: 'free' });
    expect(result?.$set_once).toEqual({
      $initial_current_url: 'https://genfeed.ai/',
    });
    expect(original.href).toContain('ref=ABCDEF23JKMN');
    expect(JSON.stringify(result)).not.toContain('ABCDEF23JKMN');
  });

  it('removes encoded referral callbacks and embedded URL strings', async () => {
    const scrub = await beforeSend();
    const result = scrub({
      uuid: 'encoded-qa',
      event: 'cta_click',
      properties: {
        href: 'https://app.genfeed.ai/login?callbackUrl=%2Fsign-up%3Fref%3DABCDEF23JKMN&source=hero',
        embedded: 'Go to /sign-up?ref=ABCDEF23JKMN',
        malformed: 'https://[invalid/?ref=ABCDEF23JKMN',
        encodedKey: 'https://genfeed.ai/?%72ef=ABCDEF23JKMN&source=hero',
        safe: 'https://genfeed.ai/pricing?source=hero#plans',
      },
    });
    expect(result?.properties).toEqual({
      href: 'https://app.genfeed.ai/login?source=hero',
      encodedKey: 'https://genfeed.ai/?source=hero',
      safe: 'https://genfeed.ai/pricing?source=hero#plans',
    });
  });

  it('bounds nested property traversal without forwarding an uninspected referral', async () => {
    const scrub = await beforeSend();
    let nested: Record<string, unknown> = { ref: 'ABCDEF23JKMN' };
    for (let index = 0; index < 8; index += 1) nested = { nested };
    const result = scrub({
      uuid: 'bounded-qa',
      event: 'cta_click',
      properties: { nested, trackingName: 'hero_primary' },
    });
    expect(result?.properties.trackingName).toBe('hero_primary');
    expect(JSON.stringify(result)).not.toContain('ABCDEF23JKMN');
  });
});
