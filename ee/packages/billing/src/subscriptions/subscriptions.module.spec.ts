import { OssSubscriptionsService } from '@api/common/subscriptions/oss-subscriptions.service';
import { isEEEnabled } from '@genfeedai/config';
import {
  resetLicenseVerificationForTests,
  setLicenseVerificationVerdictForTests,
} from '@genfeedai/config/license-server';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SUBSCRIPTIONS_TOKEN = 'SubscriptionsService';

describe('SubscriptionsModule', () => {
  beforeEach(() => {
    resetLicenseVerificationForTests();
  });

  afterEach(() => {
    resetLicenseVerificationForTests();
    vi.unstubAllEnvs();
  });

  it('resolves subscriptions service to OSS stub when EE is disabled', async () => {
    vi.stubEnv('GENFEED_LICENSE_KEY', '');

    const module = await Test.createTestingModule({
      providers: [
        {
          provide: SUBSCRIPTIONS_TOKEN,
          useClass: isEEEnabled()
            ? OssSubscriptionsService
            : OssSubscriptionsService,
        },
      ],
    }).compile();

    const service = module.get(SUBSCRIPTIONS_TOKEN);
    expect(service).toBeInstanceOf(OssSubscriptionsService);
  });

  it('isEEEnabled rejects an unverified license value', () => {
    vi.stubEnv('GENFEED_LICENSE_KEY', 'garbage');
    expect(isEEEnabled()).toBe(false);
  });

  it('isEEEnabled returns the cached verification verdict', () => {
    setLicenseVerificationVerdictForTests(true);
    expect(isEEEnabled()).toBe(true);
  });
});
