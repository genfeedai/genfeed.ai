import type { OnboardingStarterAssetsService } from '@api/endpoints/onboarding/services/onboarding-starter-assets.service';
import type { OnboardingStarterAssetsJobData } from '@genfeedai/contracts/queue';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import { OnboardingStarterAssetsProcessor } from './onboarding-starter-assets.processor';

describe('OnboardingStarterAssetsProcessor', () => {
  it('runs the job data through the starter assets service', async () => {
    const generateForJob = vi.fn().mockResolvedValue({
      adImageUrl: null,
      postId: 'post-1',
      tweet: 'hello',
    });
    const processor = new OnboardingStarterAssetsProcessor({
      generateForJob,
    } as unknown as OnboardingStarterAssetsService);

    const jobData: OnboardingStarterAssetsJobData = {
      brandId: 'brand-1',
      organizationId: 'org-1',
      userId: 'user-1',
      websiteUrl: 'https://acme.com',
    };

    await processor.process({
      data: jobData,
    } as Job<OnboardingStarterAssetsJobData>);

    expect(generateForJob).toHaveBeenCalledWith(jobData);
  });
});
