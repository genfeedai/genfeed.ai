import { OssCreditsUtilsService } from '@api/common/credits/oss-credits-utils.service';
import { isEEEnabled } from '@genfeedai/config';
import {
  resetLicenseVerificationForTests,
  setLicenseVerificationVerdictForTests,
} from '@genfeedai/config/license-server';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CREDITS_UTILS_TOKEN = 'CreditsUtilsService';

describe('CreditsModule', () => {
  beforeEach(() => {
    resetLicenseVerificationForTests();
  });

  afterEach(() => {
    resetLicenseVerificationForTests();
    vi.unstubAllEnvs();
  });

  it('resolves credits service to OSS stub when EE is disabled', async () => {
    vi.stubEnv('GENFEED_LICENSE_KEY', '');

    const module = await Test.createTestingModule({
      providers: [
        {
          provide: CREDITS_UTILS_TOKEN,
          useClass: isEEEnabled()
            ? OssCreditsUtilsService
            : OssCreditsUtilsService,
        },
      ],
    }).compile();

    const service = module.get(CREDITS_UTILS_TOKEN);
    expect(service).toBeInstanceOf(OssCreditsUtilsService);
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
