import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  hasOrganizationBilling,
  hasOrganizationBillingHint,
  isEEEnabled,
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
