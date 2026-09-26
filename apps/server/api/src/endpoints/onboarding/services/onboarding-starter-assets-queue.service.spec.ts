import { OnboardingStarterAssetsQueueService } from '@api/endpoints/onboarding/services/onboarding-starter-assets-queue.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

describe('OnboardingStarterAssetsQueueService', () => {
  it('enqueues one deduplicated job per brand', async () => {
    const add = vi.fn().mockResolvedValue({ id: 'job-1' });
    const logger = { debug: vi.fn() } as unknown as LoggerService;
    const service = new OnboardingStarterAssetsQueueService(
      { add } as never,
      logger,
    );

    await service.enqueue({
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
      websiteUrl: 'https://acme.com',
    });

    expect(add).toHaveBeenCalledWith(
      'generate-starter-assets',
      expect.objectContaining({ brandId: 'brand-1' }),
      expect.objectContaining({ jobId: 'onboarding-starter-assets-brand-1' }),
    );
  });
});
