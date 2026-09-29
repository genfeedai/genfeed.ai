import { GenerationType } from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS } from './analytics-events';

const mocks = vi.hoisted(() => ({
  isSaaS: vi.fn(),
  loggerError: vi.fn(),
  posthogCapture: vi.fn(),
  posthogGetGroups: vi.fn(),
  posthogGetProperty: vi.fn(),
  posthogGroup: vi.fn(),
  posthogIdentify: vi.fn(),
  posthogImport: vi.fn(),
  posthogInit: vi.fn(),
  posthogReset: vi.fn(),
  posthogResetGroups: vi.fn(),
}));

vi.mock('@genfeedai/config/deployment', () => ({
  isSaaS: mocks.isSaaS,
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: mocks.loggerError },
}));

vi.mock('posthog-js', () => {
  mocks.posthogImport();
  return {
    default: {
      capture: mocks.posthogCapture,
      getGroups: mocks.posthogGetGroups,
      get_property: mocks.posthogGetProperty,
      group: mocks.posthogGroup,
      identify: mocks.posthogIdentify,
      init: mocks.posthogInit,
      reset: mocks.posthogReset,
      resetGroups: mocks.posthogResetGroups,
    },
  };
});

type PosthogClientModule = typeof import('./posthog-client');

let loadedClient: PosthogClientModule | null = null;

/**
 * The module captures NEXT_PUBLIC_POSTHOG_KEY at import time, so every case
 * re-imports after stubbing env to exercise the intended enabled/disabled state.
 */
async function loadClient(): Promise<PosthogClientModule> {
  vi.resetModules();
  loadedClient = await import('./posthog-client');
  return loadedClient;
}

/** Flush the dynamic import()/microtask queue used by initAnalytics. */
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

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  stubImmediateIdleCallback();
  mocks.posthogCapture.mockReset();
  mocks.isSaaS.mockReturnValue(true);
  mocks.posthogGetGroups.mockReturnValue({});
  mocks.posthogGetProperty.mockReturnValue(undefined);
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_testkey');
});

afterEach(() => {
  loadedClient?.__resetAnalyticsForTests();
  loadedClient = null;
  vi.unstubAllGlobals();
});

describe('isAnalyticsEnabled', () => {
  it.each([
    ['a placeholder', '-'],
    ['an empty value', ''],
    ['a non-PostHog value', 'project_123'],
  ])('is disabled when the key is %s', async (_label, key) => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', key);
    const client = await loadClient();
    expect(client.isAnalyticsEnabled()).toBe(false);
  });
});

describe('initAnalytics', () => {
  it('disables SDK pageview capture until app scope is synchronized', async () => {
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();
    const config = mocks.posthogInit.mock.calls[0]?.[1] as {
      capture_pageleave: unknown;
      capture_pageview: unknown;
      before_send: unknown;
      disable_session_recording: unknown;
      loaded: unknown;
    };
    expect(config.capture_pageview).toBe(false);
    expect(config.capture_pageleave).toBe(true);
    expect(typeof config.before_send).toBe('function');
    expect(typeof config.loaded).toBe('function');
    // Replay must stay off — $snapshot bypasses before_send scrubbing.
    expect(config.disable_session_recording).toBe(true);
  });

  it('before_send strips free-text and reduces URL properties to route templates', async () => {
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();
    const config = mocks.posthogInit.mock.calls[0]?.[1] as {
      before_send: (event: unknown) => { properties: Record<string, unknown> };
    };

    const capturedAt = new Date('2026-07-15T00:00:00.000Z');
    const originalProperties = {
      $current_url:
        'https://app.genfeed.ai/acme/brand/publishing/review?title=Secret%20Post&description=xyz',
      $pathname: '/acme/brand/publishing/3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      $prev_pageview_pathname:
        '/acme/brand/studio/edit/3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      $referrer: 'https://app.genfeed.ai/acme/brand/publishing/x?title=leak',
      $set_once: {
        $initial_current_url:
          'https://app.genfeed.ai/acme/brand/publishing/review?title=Secret%20Post',
      },
      title: 'Secret Post — Genfeed',
      utm_term: 'a secret search phrase',
      email: 'acceptance@example.com',
      paymentMethod: 'pm_private',
      prompt: 'Draft a confidential launch plan',
      completion: 'Confidential generated copy',
      platform: 'acceptance@example.com',
      providerId: 'sk_live_private',
      nested: {
        cardNumber: '4242424242424242',
        credentialId: 'credential-secret',
        messageText: 'private conversation',
      },
      deeplyNested: {
        one: {
          two: {
            three: { four: { capturedAt, five: { safe: 'drop-at-limit' } } },
          },
        },
      },
    };
    const scrubbed = config.before_send({
      event: '$pageview',
      properties: originalProperties,
    });

    const props = scrubbed.properties;
    // No query string and no free-text survives on any value.
    for (const value of [
      props.$current_url,
      props.$referrer,
      (props.$set_once as Record<string, unknown>).$initial_current_url,
    ]) {
      expect(String(value)).not.toContain('?');
      expect(String(value)).not.toMatch(/secret|leak/i);
    }
    // Free-text keys are dropped entirely.
    expect(props.title).toBeUndefined();
    expect(props.utm_term).toBeUndefined();
    expect(props.email).toBeUndefined();
    expect(props.paymentMethod).toBeUndefined();
    expect(props.prompt).toBeUndefined();
    expect(props.completion).toBeUndefined();
    expect(props.platform).toBeUndefined();
    expect(props.providerId).toBeUndefined();
    expect(props.nested).toEqual({});
    expect(props.deeplyNested).toEqual({
      one: { two: { three: { four: { capturedAt, five: {} } } } },
    });
    expect(originalProperties.prompt).toBe('Draft a confidential launch plan');
    expect(originalProperties.nested).toEqual({
      cardNumber: '4242424242424242',
      credentialId: 'credential-secret',
      messageText: 'private conversation',
    });
    expect(scrubbed.properties).not.toBe(originalProperties);
    // Tenant slugs templatized, ids collapsed — on top-level and nested bags.
    expect(props.$current_url).toBe(
      'https://app.genfeed.ai/:org/:brand/publishing/review',
    );
    expect(props.$pathname).toBe('/:org/:brand/publishing/:id');
    expect(props.$prev_pageview_pathname).toBe('/:org/:brand/studio/edit/:id');
    expect(
      (props.$set_once as Record<string, unknown>).$initial_current_url,
    ).toBe('https://app.genfeed.ai/:org/:brand/publishing/review');
  });

  it('before_send keeps the project token and distinct id PostHog routes by', async () => {
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();
    const config = mocks.posthogInit.mock.calls[0]?.[1] as {
      before_send: (event: unknown) => { properties: Record<string, unknown> };
    };

    const scrubbed = config.before_send({
      event: '$pageview',
      properties: {
        accessToken: 'test-access-value',
        distinct_id: 'user_opaque_1',
        token: 'phc_testkey',
      },
    });

    expect(scrubbed.properties.token).toBe('phc_testkey');
    expect(scrubbed.properties.distinct_id).toBe('user_opaque_1');
    expect(scrubbed.properties.accessToken).toBeUndefined();
  });

  it('before_send scrubs top-level person updates and prefixed search terms', async () => {
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();
    const config = mocks.posthogInit.mock.calls[0]?.[1] as {
      before_send: (event: unknown) => {
        $set: Record<string, unknown>;
        $set_once: Record<string, unknown>;
        properties: Record<string, unknown>;
      };
    };

    const scrubbed = config.before_send({
      $set: {
        $current_url:
          'https://app.genfeed.ai/acme/brand/publishing/review?title=Confidential',
      },
      $set_once: {
        $initial_current_url:
          'https://app.genfeed.ai/acme/brand/publishing/review?title=Confidential',
        $initial_utm_campaign:
          '  HTTPS://app.genfeed.ai/acme/brand?document=confidential',
        $initial_utm_content:
          'campaign=https://app.genfeed.ai/acme/brand?document=confidential',
        $initial_utm_medium:
          'https:\\\\app.genfeed.ai\\acme\\brand?document=confidential',
        $initial_utm_source: 'newsletter',
        $initial_utm_term: 'confidential search',
        $session_entry_url:
          '//app.genfeed.ai/acme/brand/publishing?document=confidential',
      },
      event: '$identify',
      properties: {
        $session_entry_utm_term: 'confidential search',
        token: 'phc_testkey',
      },
    });

    expect(scrubbed.$set.$current_url).toBe(
      'https://app.genfeed.ai/:org/:brand/publishing/review',
    );
    expect(scrubbed.$set_once.$initial_current_url).toBe(
      'https://app.genfeed.ai/:org/:brand/publishing/review',
    );
    expect(scrubbed.$set_once.$initial_utm_campaign).toBe(
      'https://app.genfeed.ai/:org/:brand',
    );
    expect(scrubbed.$set_once.$initial_utm_source).toBe('newsletter');
    expect(scrubbed.$set_once.$initial_utm_content).toBeUndefined();
    expect(scrubbed.$set_once.$initial_utm_medium).toBeUndefined();
    expect(scrubbed.$set_once.$session_entry_url).toBe(
      'https://app.genfeed.ai/:org/:brand/publishing',
    );
    expect(scrubbed.$set_once.$initial_utm_term).toBeUndefined();
    expect(scrubbed.properties.$session_entry_utm_term).toBeUndefined();
  });

  it.each([
    ['a placeholder', '-'],
    ['empty', ''],
    ['a non-PostHog value', 'project_123'],
  ])('never imports the SDK when the key is %s', async (_label, key) => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', key);
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogImport).not.toHaveBeenCalled();
    expect(mocks.posthogInit).not.toHaveBeenCalled();
  });

  it('is idempotent across repeated calls', async () => {
    const client = await loadClient();
    client.initAnalytics();
    client.initAnalytics();
    await flushInit();
    expect(mocks.posthogInit).toHaveBeenCalledTimes(1);
  });
});

describe('captureAnalyticsEvent', () => {
  it('captures Brand OS acceptance and the first subsequent generation once', async () => {
    const client = await loadClient();
    client.captureBrandOsFunnelStage('draft_accepted');
    client.captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_STARTED, {
      generationType: GenerationType.POST,
    });
    client.captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_STARTED, {
      generationType: GenerationType.POST,
    });
    client.initAnalytics();
    await flushInit();

    const events = mocks.posthogCapture.mock.calls.map(([event]) => event);
    expect(
      events.filter((event) => event === 'brand_os_draft_accepted'),
    ).toHaveLength(1);
    expect(
      events.filter((event) => event === 'brand_os_first_generation'),
    ).toHaveLength(1);
  });

  it('restores a signup event after a full-page authentication redirect', async () => {
    const firstPage = await loadClient();
    firstPage.captureAnalyticsEvent(ANALYTICS_EVENTS.SIGNUP_STARTED, {
      hasCloudHandoff: true,
      hasCreditsIntent: false,
      hasPlanIntent: true,
      method: 'google',
    });

    const callbackPage = await loadClient();
    callbackPage.initAnalytics();
    await flushInit();

    expect(mocks.posthogCapture).toHaveBeenCalledOnce();
    expect(mocks.posthogCapture).toHaveBeenCalledWith('signup_started', {
      hasCloudHandoff: true,
      hasCreditsIntent: false,
      hasPlanIntent: true,
      method: 'google',
    });
  });

  it('swallows capture errors so a tracked action is never blocked', async () => {
    mocks.posthogCapture.mockImplementation(() => {
      throw new Error('network down');
    });
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();

    expect(() =>
      client.captureAnalyticsEvent(ANALYTICS_EVENTS.AGENT_THREAD_CREATED, {}),
    ).not.toThrow();
  });

  it('retries a synchronous capture failure and reports only sanitized operational context', async () => {
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();
    mocks.posthogCapture.mockImplementationOnce(() => {
      throw new Error('request body contained private data');
    });
    vi.useFakeTimers();

    try {
      expect(() =>
        client.captureAnalyticsEvent(ANALYTICS_EVENTS.CHECKOUT_STARTED, {
          checkoutKind: 'plan',
          handoffSource: 'post_signup',
        }),
      ).not.toThrow();

      expect(mocks.loggerError).toHaveBeenCalledWith(
        'PostHog analytics delivery failed',
        {
          code: 'posthog_capture_failed',
          event: 'checkout_started',
          reportToSentry: false,
        },
      );

      await vi.advanceTimersByTimeAsync(1000);

      expect(mocks.posthogCapture).toHaveBeenCalledTimes(2);
      expect(mocks.posthogCapture).toHaveBeenLastCalledWith(
        'checkout_started',
        { checkoutKind: 'plan', handoffSource: 'post_signup' },
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('captures each first-only event once per identified user', async () => {
    const client = await loadClient();
    client.identifyAnalyticsUser({ id: 'user-123', isInternal: false });
    client.initAnalytics();
    await flushInit();

    for (let attempt = 0; attempt < 2; attempt += 1) {
      client.captureAnalyticsEvent(ANALYTICS_EVENTS.FIRST_CREDIT_PURCHASED, {
        checkoutKind: 'credits',
        handoffSource: 'stripe_return',
      });
      client.captureAnalyticsEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {});
      client.captureAnalyticsEvent(ANALYTICS_EVENTS.FIRST_SUCCESSFUL_PUBLISH, {
        platform: 'newsletter',
        surface: 'newsletter',
      });
    }

    expect(mocks.posthogCapture.mock.calls.map(([event]) => event)).toEqual([
      'first_credit_purchase',
      'onboarding_completed',
      'first_successful_publish',
    ]);
  });
});

describe('delivery observability', () => {
  it('reports PostHog request failures without response bodies or raw errors', async () => {
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();
    const config = mocks.posthogInit.mock.calls[0]?.[1] as {
      on_request_error: (response: {
        error: Error;
        statusCode: number;
        text: string;
      }) => void;
    };

    config.on_request_error({
      error: new Error('private transport detail'),
      statusCode: 503,
      text: 'private response body',
    });

    expect(mocks.loggerError).toHaveBeenCalledWith(
      'PostHog analytics delivery failed',
      {
        code: 'posthog_request_failed',
        reportToSentry: false,
        statusCode: 503,
      },
    );
  });
});

describe('analytics identity lifecycle', () => {
  it('clears an active organization without resetting the user identity', async () => {
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();

    client.identifyAnalyticsOrganization('org-123');
    client.clearAnalyticsOrganization();

    expect(mocks.posthogResetGroups).toHaveBeenCalledOnce();
    expect(mocks.posthogReset).not.toHaveBeenCalled();
  });

  it('applies a queued logout from the SDK loaded callback', async () => {
    mocks.posthogInit.mockImplementationOnce(
      (
        _token: string,
        config: {
          loaded?: (sdk: { reset: typeof mocks.posthogReset }) => void;
        },
      ) => {
        config.loaded?.({
          reset: mocks.posthogReset,
        });
      },
    );
    const client = await loadClient();

    client.resetAnalytics();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogReset).toHaveBeenCalledOnce();
  });

  it('still applies organization and pageview when identify throws', async () => {
    mocks.posthogIdentify.mockImplementationOnce(() => {
      throw new Error('identify failed');
    });
    const client = await loadClient();

    client.identifyAnalyticsUser({ id: 'user-123', isInternal: false });
    client.identifyAnalyticsOrganization('org-123');
    client.captureAnalyticsPageview();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogGroup).toHaveBeenCalledWith('organization', 'org-123');
    expect(mocks.posthogCapture).toHaveBeenCalledWith('$pageview', {
      $current_url: window.location.href,
    });
  });

  it('defers an organization-only reset until the SDK finishes loading', async () => {
    const client = await loadClient();

    client.clearAnalyticsOrganization();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogResetGroups).toHaveBeenCalledOnce();
    expect(mocks.posthogReset).not.toHaveBeenCalled();
  });

  it('honors an organization clear queued after identification', async () => {
    const client = await loadClient();

    client.identifyAnalyticsOrganization('org-789');
    client.clearAnalyticsOrganization();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogGroup).not.toHaveBeenCalled();
    expect(mocks.posthogResetGroups).toHaveBeenCalledOnce();
  });

  it('preserves an existing anonymous identity when no group is persisted', async () => {
    const client = await loadClient();

    client.ensureAnalyticsAnonymous();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogReset).not.toHaveBeenCalled();
    expect(mocks.posthogResetGroups).not.toHaveBeenCalled();
  });

  it('clears a stale group without rotating an anonymous identity', async () => {
    mocks.posthogGetGroups.mockReturnValue({ organization: 'org-old' });
    const client = await loadClient();

    client.ensureAnalyticsAnonymous();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogReset).not.toHaveBeenCalled();
    expect(mocks.posthogResetGroups).toHaveBeenCalledOnce();
  });

  it('does not restore queued account scope after auth resolves anonymous', async () => {
    mocks.posthogGetProperty.mockReturnValue('persisted-user');
    const client = await loadClient();

    client.identifyAnalyticsUser({ id: 'persisted-user', isInternal: false });
    client.identifyAnalyticsOrganization('org-old');
    client.captureAnalyticsPageview();
    client.ensureAnalyticsAnonymous();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogReset).toHaveBeenCalledOnce();
    expect(mocks.posthogIdentify).not.toHaveBeenCalled();
    expect(mocks.posthogGroup).not.toHaveBeenCalled();
    expect(mocks.posthogCapture).not.toHaveBeenCalled();
  });

  it('deduplicates repeated renders of the same scoped route', async () => {
    const client = await loadClient();
    expect(mocks.posthogCapture).not.toHaveBeenCalled();

    client.captureAnalyticsPageview('user-1:org-1:/library');
    client.initAnalytics();
    await flushInit();
    expect(mocks.posthogCapture).toHaveBeenCalledTimes(1);
    client.captureAnalyticsPageview('user-1:org-1:/library');
    expect(mocks.posthogCapture).toHaveBeenCalledTimes(1);
    client.captureAnalyticsPageview('user-1:org-1:/publishing');

    expect(mocks.posthogCapture).toHaveBeenCalledTimes(2);
  });
});
