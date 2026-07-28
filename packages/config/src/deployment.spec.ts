import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  envFlag,
  getClientSurface,
  getDeployment,
  isCloudDeployment,
  isCommunity,
  isDesktopClient,
  isSaaS,
  isSelfHostedDeployment,
} from './deployment';

afterEach(() => {
  vi.unstubAllEnvs();
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
  ] as const)('resolves server=%s public=%s as %s', (serverFlag, publicFlag, expected) => {
    vi.stubEnv('GENFEED_CLOUD', serverFlag);
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', publicFlag);

    expect(getDeployment()).toBe(expected);
    expect(isCloudDeployment()).toBe(expected === 'cloud');
    expect(isSelfHostedDeployment()).toBe(expected === 'self-hosted');
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

  it.each([
    ['1', undefined, true, false],
    ['1', '1', false, false],
    [undefined, undefined, false, true],
    [undefined, '1', false, false],
  ] as const)('maps cloud=%s desktop=%s to SaaS=%s Community=%s', (cloudFlag, desktopFlag, expectedSaaS, expectedCommunity) => {
    vi.stubEnv('GENFEED_CLOUD', cloudFlag);
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', desktopFlag);

    expect(isSaaS()).toBe(expectedSaaS);
    expect(isCommunity()).toBe(expectedCommunity);
  });
});
