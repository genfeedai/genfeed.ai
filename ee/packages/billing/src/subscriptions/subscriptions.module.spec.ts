import { hasOrganizationBilling } from '@genfeedai/config';
import { resetLicenseVerificationForTests } from '@genfeedai/config/license-server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('SubscriptionsModule entitlement', () => {
  beforeEach(() => {
    resetLicenseVerificationForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    resetLicenseVerificationForTests();
  });

  it('keeps an unlicensed production self-host on OSS billing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GENFEED_CLOUD', 'false');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', 'false');
    vi.stubEnv('GENFEED_LICENSE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_LICENSE_KEY', '');
    vi.stubEnv('GENFEEDAI_API_PUBLIC_URL', 'https://api.example.com');

    expect(hasOrganizationBilling()).toBe(false);
  });
});
