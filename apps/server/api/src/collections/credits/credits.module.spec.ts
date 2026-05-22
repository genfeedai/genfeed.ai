import { OssCreditsUtilsService } from '@api/common/credits/oss-credits-utils.service';
import { isEEEnabled } from '@genfeedai/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

const CREDITS_UTILS_TOKEN = 'CreditsUtilsService';

describe('CreditsModule', () => {
  afterEach(() => {
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

  it('isEEEnabled returns false without license key', () => {
    vi.stubEnv('GENFEED_LICENSE_KEY', '');
    expect(isEEEnabled()).toBe(false);
  });

  it('isEEEnabled returns true with license key', () => {
    vi.stubEnv('GENFEED_LICENSE_KEY', 'test-key-123');
    expect(isEEEnabled()).toBe(true);
  });
});
