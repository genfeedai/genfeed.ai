import { OssSubscriptionsService } from '@api/common/subscriptions/oss-subscriptions.service';
import { hasOrganizationBilling } from '@genfeedai/config';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('SubscriptionsModule billing DI branch', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses OSS stub when not SaaS and no EE license', () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
    vi.stubEnv('GENFEED_LICENSE_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '');

    expect(hasOrganizationBilling()).toBe(false);
    const useClass = hasOrganizationBilling()
      ? class Metered {}
      : OssSubscriptionsService;
    expect(useClass).toBe(OssSubscriptionsService);
  });

  it('uses metered path on SaaS without a license key', () => {
    vi.stubEnv('GENFEED_LICENSE_KEY', '');
    vi.stubEnv('GENFEED_CLOUD', 'true');
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '');

    expect(hasOrganizationBilling()).toBe(true);
  });

  it('uses metered path on self-host with EE license', () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
    vi.stubEnv('GENFEED_LICENSE_KEY', 'test-key-123');
    vi.stubEnv('NEXT_PUBLIC_DESKTOP_SHELL', '');

    expect(hasOrganizationBilling()).toBe(true);
  });
});
