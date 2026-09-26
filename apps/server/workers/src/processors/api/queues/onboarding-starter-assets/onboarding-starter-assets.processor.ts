import { OnboardingStarterAssetsService } from '@api/endpoints/onboarding/services/onboarding-starter-assets.service';
import {
  ONBOARDING_STARTER_ASSETS_QUEUE,
  type OnboardingStarterAssetsJobData,
} from '@genfeedai/contracts/queue';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor(ONBOARDING_STARTER_ASSETS_QUEUE)
export class OnboardingStarterAssetsProcessor extends WorkerHost {
  constructor(
    private readonly onboardingStarterAssetsService: OnboardingStarterAssetsService,
  ) {
    super();
  }

  async process(job: Job<OnboardingStarterAssetsJobData>): Promise<void> {
    await this.onboardingStarterAssetsService.generateForJob(job.data);
  }
}
