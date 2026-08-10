import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  envFlag,
  getClientSurface,
  getDeployment,
  hasAgentFirstOnboarding,
  hostnameFromUrl,
  isCloudDeployment,
  isCommunity,
  isDesktopClient,
  isHostedGenfeedCloud,
  isHostedGenfeedFromBrowser,
  isHostedGenfeedFromEnv,
  isHostedGenfeedHostname,
  isSaaS,
  isSelfHostedDeployment,
} from './deployment';

afterEach(() => {
  vi.unstubAllEnvs();
  delete (
    globalThis as typeof globalThis & {
      __GENFEED_RUNTIME_CONFIG__?: { clientSurface?: string };
      location?: { hostname?: string };
    }
  ).__GENFEED_RUNTIME_CONFIG__;
  // jsdom / vitest may keep location — only clear our stubbed hostname path
  try {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: undefined,
      writable: true,
    });
  } catch {
    // ignore environments that freeze location
  }
});

describe('envFlag', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['TRUE ', true],
    [' 1 ', true],
    ['0', false],
    ['false', false],
    ['', false],
    [undefined, false],
  ] as const)('resolves %s as %s', (value, expected) => {
    expect(envFlag(value)).toBe(expected);
  });
});

describe('isHostedGenfeedHostname', () => {
  it.each([
    ['genfeed.ai', true],
    ['www.genfeed.ai', true],
    ['app.genfeed.ai', true],
    ['api.genfeed.ai', true],
    ['admin.genfeed.ai', true],
    ['mcp.genfeed.ai', true],
    ['cdn.genfeed.ai', true],
    ['staging.app.genfeed.ai', true],
    ['genfeed.localhost', false],
    ['app.genfeed.localhost', false],
    ['api.genfeed.internal', false],
    ['localhost', false],
    ['example.com', false],
    ['genfeed.ai.evil.com', false],
    ['', false],
  ] as const)('%s → %s', (hostname, expected) => {
    expect(isHostedGenfeedHostname(hostname)).toBe(expected);
  });
});

describe('hostnameFromUrl', () => {
  it('parses absolute URLs and bare hosts', () => {
    expect(hostnameFromUrl('https://api.genfeed.ai/v1')).toBe('api.genfeed.ai');
    expect(hostnameFromUrl('app.genfeed.ai')).toBe('app.genfeed.ai');
    expect(hostnameFromUrl('not a url')).toBeUndefined();
    expect(hostnameFromUrl(undefined)).toBeUndefined();
  });
});

describe('isHostedGenfeedCloud', () => {
  it('is true from any public *.genfeed.ai env URL without GENFEED_CLOUD', () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', '');
    vi.stubEnv('NEXT_PUBLIC_APPS_APP_ENDPOINT', 'https://app.genfeed.ai');

    expect(isHostedGenfeedFromEnv()).toBe(true);
    expect(isHostedGenfeedCloud()).toBe(true);
    expect(getDeployment()).toBe('cloud');
    expect(isSaaS()).toBe(true);
  });

  it('is true from the browser hostname on app.genfeed.ai', () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
    for (const key of [
      'GENFEEDAI_API_PUBLIC_URL',
      'GENFEEDAI_APP_URL',
      'NEXT_PUBLIC_API_ENDPOINT',
      'NEXT_PUBLIC_APPS_APP_ENDPOINT',
    ] as const) {
      vi.stubEnv(key, '');
    }

    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { hostname: 'app.genfeed.ai' },
      writable: true,
    });

    expect(isHostedGenfeedFromBrowser()).toBe(true);
    expect(isHostedGenfeedCloud()).toBe(true);
    expect(getDeployment()).toBe('cloud');
  });

  it('is false for self-host and Portless local hostnames', () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.example.com');
    vi.stubEnv(
      'NEXT_PUBLIC_APPS_APP_ENDPOINT',
      'https://app.genfeed.localhost',
    );

    expect(isHostedGenfeedCloud()).toBe(false);
    expect(getDeployment()).toBe('self-hosted');
  });

  it('is false for internal Cloud Map hosts', () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'http://api.genfeed.internal:3010');

    expect(isHostedGenfeedFromEnv()).toBe(false);
  });
});

describe('deployment axes', () => {
  it('lets an explicit false cloud flag override a hosted URL', () => {
    vi.stubEnv('GENFEED_CLOUD', 'false');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.genfeed.ai');

    expect(getDeployment()).toBe('self-hosted');
    expect(isCloudDeployment()).toBe(false);
  });

  it.each([
    [undefined, undefined, 'self-hosted'],
    ['false', 'true', 'self-hosted'],
    [undefined, '1', 'cloud'],
    [' TRUE ', undefined, 'cloud'],
  ] as const)(
    'resolves server=%s public=%s as %s',
    (serverFlag, publicFlag, expected) => {
      vi.stubEnv('GENFEED_CLOUD', serverFlag);
      vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', publicFlag);
      vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', '');
      vi.stubEnv('GENFEEDAI_APP_URL', '');
      vi.stubEnv('NEXT_PUBLIC_APPS_APP_ENDPOINT', '');
      vi.stubEnv('NEXT_PUBLIC_API_ENDPOINT', '');

      expect(getDeployment()).toBe(expected);
      expect(isCloudDeployment()).toBe(expected === 'cloud');
      expect(isSelfHostedDeployment()).toBe(expected === 'self-hosted');
    },
  );

  it.each([
    ['1', 'desktop'],
    ['true', 'desktop'],
    ['false', 'web'],
    [undefined, 'web'],
  ] as const)('resolves desktop=%s as %s', (desktopFlag, expected) => {
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', desktopFlag);

    expect(getClientSurface()).toBe(expected);
    expect(isDesktopClient()).toBe(expected === 'desktop');
  });

  it('resolves the desktop surface from request-injected runtime config', () => {
    (
      globalThis as typeof globalThis & {
        __GENFEED_RUNTIME_CONFIG__?: { clientSurface?: 'desktop' | 'web' };
      }
    ).__GENFEED_RUNTIME_CONFIG__ = { clientSurface: 'desktop' };

    expect(getClientSurface()).toBe('desktop');
    expect(isDesktopClient()).toBe(true);
  });

  it.each([
    ['1', undefined, true, false],
    ['1', '1', false, false],
    [undefined, undefined, false, true],
    [undefined, '1', false, false],
  ] as const)(
    'maps cloud=%s desktop=%s to SaaS=%s Community=%s',
    (cloudFlag, desktopFlag, expectedSaaS, expectedCommunity) => {
      vi.stubEnv('GENFEED_CLOUD', cloudFlag);
      vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', desktopFlag);
      vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', '');
      vi.stubEnv('NEXT_PUBLIC_APPS_APP_ENDPOINT', '');

      expect(isSaaS()).toBe(expectedSaaS);
      expect(isCommunity()).toBe(expectedCommunity);
    },
  );

  it.each([
    ['1', undefined, true],
    [undefined, undefined, true],
    [undefined, '1', false],
  ] as const)(
    'maps cloud=%s desktop=%s to agent-first onboarding=%s',
    (cloudFlag, desktopFlag, expected) => {
      vi.stubEnv('GENFEED_CLOUD', cloudFlag);
      vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', desktopFlag);

      expect(hasAgentFirstOnboarding()).toBe(expected);
    },
  );
});
