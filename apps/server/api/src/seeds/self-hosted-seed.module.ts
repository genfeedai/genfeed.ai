/**
 * Boot seed module.
 *
 * - SelfHostedSeedService creates the default workspace on first boot when
 *   running in self-hosted mode (no legacy auth provider).
 * - ModelCatalogSeedService reconciles the unified model registry on every
 *   boot, in every deployment mode.
 */

import { ModelCatalogSeedService } from '@api/seeds/model-catalog-seed.service';
import { SelfHostedSeedService } from '@api/seeds/self-hosted-seed.service';
import { WorkflowDeploymentBackfillService } from '@api/seeds/workflow-deployment-backfill.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [LoggerModule],
  providers: [
    ModelCatalogSeedService,
    SelfHostedSeedService,
    WorkflowDeploymentBackfillService,
  ],
})
export class SelfHostedSeedModule {}
