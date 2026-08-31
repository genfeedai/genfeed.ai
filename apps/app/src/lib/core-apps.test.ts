import { afterEach, describe, expect, it, vi } from 'vitest';
import { CORE_APPS, getCoreAppFeatureFlagFallbacks } from './core-apps';

describe('CORE_APPS', () => {
  it('exposes exactly Agent, Automation, and Studio', () => {
    expect(CORE_APPS.map((app) => app.id)).toEqual([
      'agent',
      'automation',
      'studio',
    ]);
  });

  it('has no standalone editor app — editing lives inside Studio', () => {
    expect(CORE_APPS.some((app) => app.href.startsWith('/editor'))).toBe(false);
  });

  it('opens Studio on the Generate surface', () => {
    expect(CORE_APPS.find((app) => app.id === 'studio')).toMatchObject({
      href: '/studio/generate',
    });
  });
});

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
      app_switcher_automate: false,
      app_switcher_library: false,
      app_switcher_messages: false,
      app_switcher_posts: false,
      app_switcher_discover: false,
      app_switcher_studio: false,
      app_switcher_workspace: false,
      reply_bot: true,
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
      app_switcher_automate: true,
      app_switcher_library: true,
      app_switcher_messages: true,
      app_switcher_posts: true,
      app_switcher_discover: true,
      app_switcher_studio: true,
      app_switcher_workspace: true,
      reply_bot: true,
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
      app_switcher_automate: true,
      app_switcher_library: true,
      app_switcher_messages: true,
      app_switcher_posts: true,
      app_switcher_discover: true,
      app_switcher_studio: true,
      app_switcher_workspace: true,
      reply_bot: true,
      studio: true,
    });
  });
});
