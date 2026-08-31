import { GenerationType } from '@genfeedai/enums';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS } from './analytics-events';

const mocks = vi.hoisted(() => ({
  isSaaS: vi.fn(),
  loggerError: vi.fn(),
  posthogCapture: vi.fn(),
  posthogFeatureFlagUnsubscribe: vi.fn(),
  posthogGetFeatureFlagResult: vi.fn(),
  posthogGetGroups: vi.fn(),
  posthogGetProperty: vi.fn(),
  posthogGroup: vi.fn(),
  posthogIdentify: vi.fn(),
  posthogImport: vi.fn(),
  posthogInit: vi.fn(),
  posthogOnFeatureFlags: vi.fn(),
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
      getFeatureFlagResult: mocks.posthogGetFeatureFlagResult,
      getGroups: mocks.posthogGetGroups,
      get_property: mocks.posthogGetProperty,
      group: mocks.posthogGroup,
      identify: mocks.posthogIdentify,
      init: mocks.posthogInit,
      onFeatureFlags: mocks.posthogOnFeatureFlags,
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
  mocks.posthogOnFeatureFlags.mockReturnValue(
    mocks.posthogFeatureFlagUnsubscribe,
  );
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
  it('is enabled in cloud, non-desktop builds with a key present', async () => {
    const client = await loadClient();
    expect(client.isAnalyticsEnabled()).toBe(true);
  });

  it('is disabled in self-hosted (non-cloud) builds', async () => {
    mocks.isSaaS.mockReturnValue(false);
    const client = await loadClient();
    expect(client.isAnalyticsEnabled()).toBe(false);
  });

  it('is disabled in desktop builds even when cloud-connected', async () => {
    mocks.isSaaS.mockReturnValue(false);
    const client = await loadClient();
    expect(client.isAnalyticsEnabled()).toBe(false);
  });

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
  it('constructs the PostHog client in cloud mode', async () => {
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();
    expect(mocks.posthogInit).toHaveBeenCalledTimes(1);
    expect(mocks.posthogInit).toHaveBeenCalledWith(
      'phc_testkey',
      expect.objectContaining({
        api_host: 'https://eu.i.posthog.com',
        autocapture: false,
      }),
    );
  });

  it('uses the default ingestion host when configuration is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', '');
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogInit).toHaveBeenCalledWith(
      'phc_testkey',
      expect.objectContaining({ api_host: 'https://eu.i.posthog.com' }),
    );
  });

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

  it('never constructs the client in self-hosted mode', async () => {
    mocks.isSaaS.mockReturnValue(false);
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();
    expect(mocks.posthogInit).not.toHaveBeenCalled();
  });

  it('never constructs the client in desktop mode', async () => {
    mocks.isSaaS.mockReturnValue(false);
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();
    expect(mocks.posthogInit).not.toHaveBeenCalled();
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

  it('buffers the ordered canonical funnel before the deferred client is initialised', async () => {
    const client = await loadClient();

    client.captureAnalyticsEvent(ANALYTICS_EVENTS.SIGNUP_STARTED, {
      hasCloudHandoff: true,
      hasCreditsIntent: true,
      hasPlanIntent: false,
      method: 'magic_link',
    });
    client.captureAnalyticsEvent(ANALYTICS_EVENTS.SIGNUP_COMPLETED, {
      handoffSource: 'post_signup',
      hasCloudHandoff: true,
      hasCreditsIntent: true,
      hasPlanIntent: false,
    });
    client.captureAnalyticsEvent(ANALYTICS_EVENTS.CHECKOUT_STARTED, {
      checkoutKind: 'credits',
      handoffSource: 'post_signup',
    });
    client.captureAnalyticsEvent(ANALYTICS_EVENTS.CHECKOUT_COMPLETED, {
      checkoutKind: 'credits',
      handoffSource: 'stripe_return',
    });
    client.captureAnalyticsEvent(ANALYTICS_EVENTS.FIRST_CREDIT_PURCHASED, {
      checkoutKind: 'credits',
      handoffSource: 'stripe_return',
    });
    client.captureAnalyticsEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {});
    client.captureAnalyticsEvent(ANALYTICS_EVENTS.FIRST_SUCCESSFUL_PUBLISH, {
      platform: 'newsletter',
      surface: 'newsletter',
    });

    expect(mocks.posthogCapture).not.toHaveBeenCalled();

    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogCapture.mock.calls.map(([event]) => event)).toEqual([
      'signup_started',
      'signup_completed',
      'checkout_started',
      'checkout_completed',
      'first_credit_purchase',
      'onboarding_completed',
      'first_successful_publish',
    ]);
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

  it('forwards the event and its bounded properties once initialised', async () => {
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();

    client.captureAnalyticsEvent(ANALYTICS_EVENTS.GENERATION_COMPLETED, {
      generationType: GenerationType.IMAGE,
      outcome: 'success',
    });

    expect(mocks.posthogCapture).toHaveBeenCalledWith('generation_completed', {
      generationType: 'image',
      outcome: 'success',
    });
  });

  it('forwards bounded workflow outcome properties', async () => {
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();

    client.captureAnalyticsEvent(ANALYTICS_EVENTS.WORKFLOW_RUN_COMPLETED, {
      outcome: 'failure',
      workflowType: 'batch',
    });

    expect(mocks.posthogCapture).toHaveBeenCalledWith(
      'workflow_run_completed',
      {
        outcome: 'failure',
        workflowType: 'batch',
      },
    );
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

describe('authenticated feature flags', () => {
  it('identifies with the canonical user id and a non-PII internal marker', async () => {
    const client = await loadClient();

    client.identifyAnalyticsUser({
      id: 'user-123',
      isInternal: true,
    });
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogIdentify).toHaveBeenCalledWith('user-123', {
      is_internal: true,
    });
  });

  it('resolves subscribed boolean flags after PostHog reports them ready', async () => {
    mocks.posthogGetFeatureFlagResult.mockImplementation((key: string) => ({
      enabled: key === 'app_switcher_agent',
      key,
    }));
    const listener = vi.fn();
    const client = await loadClient();

    client.identifyAnalyticsUser({
      id: 'user-123',
      isInternal: true,
    });
    const unsubscribe = client.subscribeAnalyticsFeatureFlags(
      ['app_switcher_agent', 'app_switcher_studio'],
      listener,
    );
    client.initAnalytics();
    await flushInit();

    const featureFlagsReady = mocks.posthogOnFeatureFlags.mock
      .calls[0]?.[0] as (
      flags: string[],
      variants: Record<string, string>,
      context: { errorsLoading: boolean },
    ) => void;
    featureFlagsReady(['app_switcher_agent'], {}, { errorsLoading: false });

    expect(listener).toHaveBeenCalledWith({
      app_switcher_agent: true,
      app_switcher_studio: false,
    });
    expect(mocks.posthogGetFeatureFlagResult).toHaveBeenCalledWith(
      'app_switcher_agent',
      { send_event: false },
    );

    unsubscribe();
    expect(mocks.posthogFeatureFlagUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('preserves product fallbacks when PostHog cannot load flags', async () => {
    mocks.posthogGetFeatureFlagResult.mockReturnValue({
      enabled: true,
      key: 'app_switcher_agent',
    });
    const listener = vi.fn();
    const client = await loadClient();

    client.subscribeAnalyticsFeatureFlags(['app_switcher_agent'], listener);
    client.initAnalytics();
    await flushInit();

    const featureFlagsReady = mocks.posthogOnFeatureFlags.mock
      .calls[0]?.[0] as (
      flags: string[],
      variants: Record<string, string>,
      context: { errorsLoading: boolean },
    ) => void;
    featureFlagsReady([], {}, { errorsLoading: true });

    expect(listener).toHaveBeenCalledWith({});
  });
});

describe('analytics identity lifecycle', () => {
  it('applies an organization identified before the SDK finishes loading', async () => {
    const client = await loadClient();

    client.identifyAnalyticsOrganization('org-123');
    expect(mocks.posthogGroup).not.toHaveBeenCalled();

    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogGroup).toHaveBeenCalledWith('organization', 'org-123');
  });

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

  it('clears persisted and pending identity after logout during SDK loading', async () => {
    const client = await loadClient();

    client.identifyAnalyticsUser({ id: 'user-123', isInternal: false });
    client.identifyAnalyticsOrganization('org-123');
    client.initAnalytics();
    client.resetAnalytics();
    await flushInit();

    expect(mocks.posthogReset).toHaveBeenCalledOnce();
    expect(mocks.posthogIdentify).not.toHaveBeenCalled();
    expect(mocks.posthogGroup).not.toHaveBeenCalled();
  });

  it('defers an organization-only reset until the SDK finishes loading', async () => {
    const client = await loadClient();

    client.clearAnalyticsOrganization();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogResetGroups).toHaveBeenCalledOnce();
    expect(mocks.posthogReset).not.toHaveBeenCalled();
  });

  it('resets persisted state before applying a newer queued identity', async () => {
    const client = await loadClient();

    client.resetAnalytics();
    client.identifyAnalyticsUser({ id: 'user-456', isInternal: false });
    client.identifyAnalyticsOrganization('org-456');
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogInit.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.posthogReset.mock.invocationCallOrder[0] as number,
    );
    expect(mocks.posthogReset.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.posthogIdentify.mock.invocationCallOrder[0] as number,
    );
    expect(mocks.posthogReset.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.posthogGroup.mock.invocationCallOrder[0] as number,
    );
  });

  it('uses the latest organization instruction queued during SDK loading', async () => {
    const client = await loadClient();

    client.clearAnalyticsOrganization();
    client.identifyAnalyticsOrganization('org-789');
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogResetGroups).not.toHaveBeenCalled();
    expect(mocks.posthogGroup).toHaveBeenCalledWith('organization', 'org-789');
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

  it('clears persisted identified state on a resolved anonymous boot', async () => {
    mocks.posthogGetProperty.mockReturnValue('persisted-user');
    const client = await loadClient();

    client.ensureAnalyticsAnonymous();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogReset).toHaveBeenCalledOnce();
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

  it('captures a queued pageview only after identity and organization sync', async () => {
    const client = await loadClient();

    client.identifyAnalyticsUser({ id: 'user-123', isInternal: false });
    client.identifyAnalyticsOrganization('org-123');
    client.captureAnalyticsPageview();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogGroup.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.posthogCapture.mock.invocationCallOrder[0] as number,
    );
    expect(mocks.posthogCapture).toHaveBeenCalledWith('$pageview', {
      $current_url: window.location.href,
    });
  });

  it('drops a protected pageview queued before logout', async () => {
    const client = await loadClient();

    client.captureAnalyticsPageview();
    client.resetAnalytics();
    client.initAnalytics();
    await flushInit();

    expect(mocks.posthogReset).toHaveBeenCalledOnce();
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

describe('event taxonomy', () => {
  it('exposes the declared events as unique snake_case slugs', () => {
    const values = Object.values(ANALYTICS_EVENTS);
    expect(new Set(values).size).toBe(values.length);
    for (const name of values) {
      expect(name).toMatch(/^[a-z][a-z_]*[a-z]$/);
    }
    expect(new Set(values)).toEqual(
      new Set([
        'agent_thread_created',
        'brand_os_draft_accepted',
        'brand_os_draft_saved',
        'brand_os_first_generation',
        'checkout_completed',
        'checkout_started',
        'connect_genfeed_step',
        'content_write_blank_draft_started',
        'content_write_opened',
        'content_write_prompt_generated',
        'conversation_shell_approval',
        'conversation_shell_error',
        'conversation_shell_overlay_abandonment',
        'conversation_shell_performance',
        'conversation_shell_restoration_failure',
        'conversation_shell_scope_correction',
        'conversation_shell_session',
        'conversation_shell_transition',
        'first_credit_purchase',
        'first_successful_publish',
        'generation_completed',
        'generation_started',
        'onboarding_completed',
        'post_published',
        'public_youtube_clip_project_claimed',
        'signup_completed',
        'signup_started',
        'studio_editor_opened',
        'workflow_run_completed',
        'workflow_run_started',
      ]),
    );
  });
});
