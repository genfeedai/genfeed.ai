import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hasOrganizationBilling,
  hasOrganizationBillingHint,
  isEEEnabled,
  shouldShowCreditsNav,
  usesMeteredCredits,
} from './license';
import {
  resetLicenseVerificationForTests,
  setLicenseVerificationVerdictForTests,
} from './license-server';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  resetLicenseVerificationForTests();
  delete process.env.GENFEED_CLOUD;
  delete process.env.NEXT_PUBLIC_GENFEED_CLOUD;
  delete process.env.NEXT_PUBLIC_DESKTOP_SHELL;
  delete process.env.GENFEED_LICENSE_KEY;
  delete process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY;
  delete process.env.GENFEEDAI_API_PUBLIC_URL;
  delete process.env.GENFEEDAI_APP_URL;
  delete process.env.GENFEEDAI_MCP_PUBLIC_URL;
  delete process.env.NEXT_PUBLIC_API_ENDPOINT;
  delete process.env.NEXT_PUBLIC_APPS_APP_ENDPOINT;
  delete process.env.NEXT_PUBLIC_APPS_ADMIN_ENDPOINT;
  delete process.env.NEXT_PUBLIC_APPS_WEBSITE_ENDPOINT;
  delete process.env.NEXT_PUBLIC_MCP_ENDPOINT;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  resetLicenseVerificationForTests();
});

describe('isEEEnabled', () => {
  it('stays false for unverified server and public license values', () => {
    process.env.GENFEED_LICENSE_KEY = 'garbage';
    process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY = 'cosmetic-only';

    expect(isEEEnabled()).toBe(false);
  });

  it('reads the cached server verification verdict synchronously', () => {
    setLicenseVerificationVerdictForTests(true);

    expect(isEEEnabled()).toBe(true);
  });
});

describe('hasOrganizationBilling', () => {
  it('is true on SaaS without a license', () => {
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';

    expect(hasOrganizationBilling()).toBe(true);
  });

  it('is true on self-host only after server verification succeeds', () => {
    process.env.GENFEED_LICENSE_KEY = 'garbage';
    expect(hasOrganizationBilling()).toBe(false);

    setLicenseVerificationVerdictForTests(true);
    expect(hasOrganizationBilling()).toBe(true);
  });

  it('is false on desktop shell even when cloud flags are set', () => {
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = 'true';

    expect(hasOrganizationBilling()).toBe(false);
  });

  it('is true when any hosted *.genfeed.ai public URL is set without GENFEED_CLOUD', () => {
    process.env.GENFEEDAI_API_PUBLIC_URL = 'https://api.genfeed.ai';
    expect(hasOrganizationBilling()).toBe(true);

    delete process.env.GENFEEDAI_API_PUBLIC_URL;
    process.env.NEXT_PUBLIC_APPS_APP_ENDPOINT = 'https://app.genfeed.ai';
    expect(hasOrganizationBilling()).toBe(true);
  });
});

describe('hasOrganizationBillingHint', () => {
  it('uses the public license value as a cosmetic self-hosted UI hint', () => {
    process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY = 'cosmetic-only';

    expect(hasOrganizationBillingHint()).toBe(true);
  });

  it('never exposes the server-only license value to UI gating', () => {
    process.env.GENFEED_LICENSE_KEY = 'server-only';

    expect(hasOrganizationBillingHint()).toBe(false);
  });
});

describe('shouldShowCreditsNav cosmetic context', () => {
  it('preserves web community and cloud visibility', () => {
    expect(shouldShowCreditsNav({ clientSurface: 'web' })).toBe(true);
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
    expect(shouldShowCreditsNav({ clientSurface: 'web' })).toBe(true);
  });

  it('uses the selected cloud account independently of generation execution', () => {
    for (const generationExecution of [
      'remote',
      'local-byok',
      'unknown',
    ] as const) {
      expect(
        shouldShowCreditsNav({
          clientSurface: 'desktop',
          selectedServerKind: 'cloud',
          runtimeMode: 'cloud',
          generationExecution,
        }),
      ).toBe(true);
    }
  });

  it('keeps remembered cloud profiles hidden in explicit local mode', () => {
    expect(
      shouldShowCreditsNav({
        clientSurface: 'desktop',
        selectedServerKind: 'cloud',
        runtimeMode: 'local',
      }),
    ).toBe(false);
    expect(
      shouldShowCreditsNav({
        clientSurface: 'desktop',
        selectedServerKind: 'cloud',
      }),
    ).toBe(false);
  });

  it('keeps self-hosted and unknown desktop contexts hidden despite cloud or license hints', () => {
    process.env.NEXT_PUBLIC_GENFEED_CLOUD = 'true';
    process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY = 'cosmetic-only';
    process.env.NEXT_PUBLIC_DESKTOP_SHELL = 'true';
    expect(shouldShowCreditsNav()).toBe(false);
    expect(shouldShowCreditsNav({ clientSurface: 'desktop' })).toBe(false);
    expect(
      shouldShowCreditsNav({
        clientSurface: 'desktop',
        selectedServerKind: null,
      }),
    ).toBe(false);
    expect(
      shouldShowCreditsNav({
        clientSurface: 'desktop',
        selectedServerKind: 'self-hosted',
      }),
    ).toBe(false);
    expect(hasOrganizationBilling()).toBe(false);
    expect(usesMeteredCredits()).toBe(false);
  });
});
