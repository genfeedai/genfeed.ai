import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OssCreditsUtilsService } from '@api/common/credits/oss-credits-utils.service';
import { isEEEnabled, usesMeteredCredits } from '@genfeedai/config';
import {
  resetLicenseVerificationForTests,
  setLicenseVerificationVerdictForTests,
} from '@genfeedai/config/license-server';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CREDITS_UTILS_TOKEN = 'CreditsUtilsService';

/**
 * Mirrors credits.module provider selection. The module itself is not imported
 * here (heavy graph); the selection rule is the regression under test.
 */
function resolveCreditsUtilsClass() {
  return usesMeteredCredits() ? CreditsUtilsService : OssCreditsUtilsService;
}

describe('CreditsModule', () => {
  beforeEach(() => {
    resetLicenseVerificationForTests();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    resetLicenseVerificationForTests();
    vi.unstubAllEnvs();
  });

  it('uses the OSS unlimited stub for community self-host (no cloud, no EE)', async () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
    vi.stubEnv('GENFEED_LICENSE_KEY', '');

    expect(usesMeteredCredits()).toBe(false);

    const module = await Test.createTestingModule({
      providers: [
        {
          provide: CREDITS_UTILS_TOKEN,
          useClass: resolveCreditsUtilsClass(),
        },
      ],
    }).compile();

    expect(module.get(CREDITS_UTILS_TOKEN)).toBeInstanceOf(
      OssCreditsUtilsService,
    );
  });

  it('meters credits on cloud SaaS even without an EE license key', async () => {
    vi.stubEnv('GENFEED_CLOUD', 'true');
    vi.stubEnv('GENFEED_LICENSE_KEY', '');

    expect(isEEEnabled()).toBe(false);
    expect(usesMeteredCredits()).toBe(true);
    expect(resolveCreditsUtilsClass()).toBe(CreditsUtilsService);
  });

  it('meters credits when EE is licensed on self-host', () => {
    vi.stubEnv('GENFEED_CLOUD', '');
    vi.stubEnv('NEXT_PUBLIC_GENFEED_CLOUD', '');
    setLicenseVerificationVerdictForTests(true);

    expect(isEEEnabled()).toBe(true);
    expect(usesMeteredCredits()).toBe(true);
    expect(resolveCreditsUtilsClass()).toBe(CreditsUtilsService);
  });
});
