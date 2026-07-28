import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCoreAppFeatureFlagFallbacks } from './core-apps';

describe('getCoreAppFeatureFlagFallbacks', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults app-switcher discovery off while keeping direct routes available in SaaS', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'false');

    expect(getCoreAppFeatureFlagFallbacks()).toEqual({
      app_switcher_agent: false,
      app_switcher_analytics: false,
      app_switcher_library: false,
      app_switcher_messages: false,
      app_switcher_posts: false,
      app_switcher_research: false,
      app_switcher_studio: false,
      app_switcher_workspace: false,
      studio: true,
    });
  });

  it('keeps app-switcher discovery and direct routes on for Desktop', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'true');
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'true');

    expect(getCoreAppFeatureFlagFallbacks()).toEqual({
      app_switcher_agent: true,
      app_switcher_analytics: true,
      app_switcher_library: true,
      app_switcher_messages: true,
      app_switcher_posts: true,
      app_switcher_research: true,
      app_switcher_studio: true,
      app_switcher_workspace: true,
      studio: true,
    });
  });

  it('keeps app-switcher discovery and direct routes on when self-hosted', () => {
    vi.stubEnv('GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', undefined);
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', 'false');

    expect(getCoreAppFeatureFlagFallbacks()).toEqual({
      app_switcher_agent: true,
      app_switcher_analytics: true,
      app_switcher_library: true,
      app_switcher_messages: true,
      app_switcher_posts: true,
      app_switcher_research: true,
      app_switcher_studio: true,
      app_switcher_workspace: true,
      studio: true,
    });
  });
});
