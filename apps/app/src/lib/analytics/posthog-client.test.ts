import { GenerationType } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS_EVENTS } from './analytics-events';

const mocks = vi.hoisted(() => ({
  isCloudConnected: vi.fn(),
  isDesktopShell: vi.fn(),
  posthogCapture: vi.fn(),
  posthogGroup: vi.fn(),
  posthogInit: vi.fn(),
  posthogReset: vi.fn(),
}));

vi.mock('@/lib/config/edition', () => ({
  isCloudConnected: mocks.isCloudConnected,
}));

vi.mock('@/lib/desktop/runtime', () => ({
  isDesktopShell: mocks.isDesktopShell,
}));

vi.mock('posthog-js', () => ({
  default: {
    capture: mocks.posthogCapture,
    group: mocks.posthogGroup,
    init: mocks.posthogInit,
    reset: mocks.posthogReset,
  },
}));

type PosthogClientModule = typeof import('./posthog-client');

/**
 * The module captures NEXT_PUBLIC_POSTHOG_KEY at import time, so every case
 * re-imports after stubbing env to exercise the intended enabled/disabled state.
 */
async function loadClient(): Promise<PosthogClientModule> {
  vi.resetModules();
  return import('./posthog-client');
}

/** Flush the dynamic import()/microtask queue used by initAnalytics. */
async function flushInit(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  mocks.isCloudConnected.mockReturnValue(true);
  mocks.isDesktopShell.mockReturnValue(false);
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test_key');
});

describe('isAnalyticsEnabled', () => {
  it('is enabled in cloud, non-desktop builds with a key present', async () => {
    const client = await loadClient();
    expect(client.isAnalyticsEnabled()).toBe(true);
  });

  it('is disabled in self-hosted (non-cloud) builds', async () => {
    mocks.isCloudConnected.mockReturnValue(false);
    const client = await loadClient();
    expect(client.isAnalyticsEnabled()).toBe(false);
  });

  it('is disabled in desktop builds even when cloud-connected', async () => {
    mocks.isDesktopShell.mockReturnValue(true);
    const client = await loadClient();
    expect(client.isAnalyticsEnabled()).toBe(false);
  });

  it('is disabled when no PostHog key is configured', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
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
      'phc_test_key',
      expect.objectContaining({ autocapture: false }),
    );
  });

  it('captures pageviews on every SPA navigation with a before_send scrub', async () => {
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();
    const config = mocks.posthogInit.mock.calls[0]?.[1] as {
      capture_pageview: unknown;
      before_send: unknown;
      disable_session_recording: unknown;
    };
    expect(config.capture_pageview).toBe('history_change');
    expect(typeof config.before_send).toBe('function');
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

    const scrubbed = config.before_send({
      event: '$pageview',
      properties: {
        $current_url:
          'https://app.genfeed.ai/acme/brand/compose/post?title=Secret%20Post&description=xyz',
        $pathname: '/acme/brand/posts/3f2504e0-4f89-41d3-9a0c-0305e82c3301',
        $prev_pageview_pathname:
          '/acme/brand/editor/3f2504e0-4f89-41d3-9a0c-0305e82c3301',
        $referrer: 'https://app.genfeed.ai/acme/brand/posts/x?title=leak',
        $set_once: {
          $initial_current_url:
            'https://app.genfeed.ai/acme/brand/compose/post?title=Secret%20Post',
        },
        title: 'Secret Post — Genfeed',
        utm_term: 'a secret search phrase',
      },
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
    // Tenant slugs templatized, ids collapsed — on top-level and nested bags.
    expect(props.$current_url).toBe(
      'https://app.genfeed.ai/:org/:brand/compose/post',
    );
    expect(props.$pathname).toBe('/:org/:brand/posts/:id');
    expect(props.$prev_pageview_pathname).toBe('/:org/:brand/editor/:id');
    expect(
      (props.$set_once as Record<string, unknown>).$initial_current_url,
    ).toBe('https://app.genfeed.ai/:org/:brand/compose/post');
  });

  it('never constructs the client in self-hosted mode', async () => {
    mocks.isCloudConnected.mockReturnValue(false);
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();
    expect(mocks.posthogInit).not.toHaveBeenCalled();
  });

  it('never constructs the client in desktop mode', async () => {
    mocks.isDesktopShell.mockReturnValue(true);
    const client = await loadClient();
    client.initAnalytics();
    await flushInit();
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
  it('no-ops (without throwing) before the client is initialised', async () => {
    const client = await loadClient();
    expect(() =>
      client.captureAnalyticsEvent(ANALYTICS_EVENTS.WORKFLOW_RUN_STARTED, {}),
    ).not.toThrow();
    expect(mocks.posthogCapture).not.toHaveBeenCalled();
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
        'content_write_blank_draft_started',
        'content_write_opened',
        'content_write_prompt_generated',
        'generation_completed',
        'generation_started',
        'post_published',
        'studio_editor_opened',
        'workflow_run_completed',
        'workflow_run_started',
      ]),
    );
  });
});
