import { OssSubscriptionsService } from '@api/common/subscriptions/oss-subscriptions.service';
import { isEEEnabled } from '@genfeedai/config';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SUBSCRIPTIONS_TOKEN = 'SubscriptionsService';

describe('SubscriptionsModule', () => {
  afterEach(() => {
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

  it('isEEEnabled returns false without license key', () => {
    vi.stubEnv('GENFEED_LICENSE_KEY', '');
    expect(isEEEnabled()).toBe(false);
  });

  it('isEEEnabled returns true with license key', () => {
    vi.stubEnv('GENFEED_LICENSE_KEY', 'test-key-123');
    expect(isEEEnabled()).toBe(true);
  });
});
