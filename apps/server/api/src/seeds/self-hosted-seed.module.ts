/**
 * Self-Hosted Seed Module
 * Provides SelfHostedSeedService, which creates the default workspace on first boot
 * when running in self-hosted mode (no legacy auth provider).
 */

import { SelfHostedSeedService } from '@api/seeds/self-hosted-seed.service';
import { WorkflowDeploymentBackfillService } from '@api/seeds/workflow-deployment-backfill.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [LoggerModule],
  providers: [SelfHostedSeedService, WorkflowDeploymentBackfillService],
})
export class SelfHostedSeedModule {}
