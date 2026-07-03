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
  it('exposes exactly the six required events as snake_case slugs', () => {
    const values = Object.values(ANALYTICS_EVENTS);
    expect(new Set(values).size).toBe(values.length);
    for (const name of values) {
      expect(name).toMatch(/^[a-z][a-z_]*[a-z]$/);
    }
    expect(values).toEqual(
      expect.arrayContaining([
        'agent_thread_created',
        'generation_completed',
        'generation_started',
        'post_published',
        'workflow_run_completed',
        'workflow_run_started',
      ]),
    );
  });
});
