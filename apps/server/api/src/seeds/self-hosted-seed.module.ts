/**
 * Seed module: default self-hosted workspace + unified model catalog.
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
