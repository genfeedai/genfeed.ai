import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  envFlag,
  getClientSurface,
  getDeployment,
  hasAgentFirstOnboarding,
  isCloudDeployment,
  isCommunity,
  isDesktopClient,
  isHostedGenfeedApi,
  isSaaS,
  isSelfHostedDeployment,
} from './deployment';

describe('isHostedGenfeedApi', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is true only for the managed api.genfeed.ai public URL', () => {
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.genfeed.ai/v1');
    expect(isHostedGenfeedApi()).toBe(true);

    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.example.com');
    expect(isHostedGenfeedApi()).toBe(false);

    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'not-a-url');
    expect(isHostedGenfeedApi()).toBe(false);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  delete (
    globalThis as typeof globalThis & {
      __GENFEED_RUNTIME_CONFIG__?: { clientSurface?: string };
    }
  ).__GENFEED_RUNTIME_CONFIG__;
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

describe('deployment axes', () => {
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

      expect(getDeployment()).toBe(expected);
      expect(isCloudDeployment()).toBe(expected === 'cloud');
      expect(isSelfHostedDeployment()).toBe(expected === 'self-hosted');
    },
  );

  it('treats the hosted api.genfeed.ai public URL as cloud without GENFEED_CLOUD', () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.genfeed.ai');

    expect(getDeployment()).toBe('cloud');
    expect(isCloudDeployment()).toBe(true);
    expect(isSaaS()).toBe(true);
  });

  it('does not treat a self-host public URL as cloud', () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.example.com');

    expect(getDeployment()).toBe('self-hosted');
  });

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
