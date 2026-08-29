import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDocsPosthogOptions } from '../lib/analytics/posthog-client';

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
  it('tracks page journeys and semantic controls without browser storage', () => {
    expect(buildDocsPosthogOptions('https://eu.i.posthog.com')).toEqual({
      api_host: 'https://eu.i.posthog.com',
      autocapture: {
        capture_copied_text: false,
        dom_event_allowlist: ['click'],
        element_allowlist: ['a', 'button'],
      },
      capture_dead_clicks: false,
      capture_pageleave: true,
      capture_pageview: 'history_change',
      capture_performance: {
        network_timing: false,
        web_vitals: true,
      },
      cookieless_mode: 'always',
      defaults: '2026-05-30',
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: 'never',
    });
  });

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
