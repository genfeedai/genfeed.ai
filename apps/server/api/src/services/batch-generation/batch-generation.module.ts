import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { PostLifecycleModule } from '@api/collections/posts/post-lifecycle.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { AgentStreamPublisherModule } from '@api/services/agent-orchestrator/agent-stream-publisher.module';
import { BatchGenerationController } from '@api/services/batch-generation/batch-generation.controller';
import { BatchGenerationService } from '@server/services/batch-generation/batch-generation.service';
import { BatchGenerationCreationService } from '@server/services/batch-generation/batch-generation-creation.service';
import { BatchGenerationCreditsService } from '@server/services/batch-generation/batch-generation-credits.service';
import { BatchGenerationProcessingService } from '@server/services/batch-generation/batch-generation-processing.service';
import { BatchGenerationReconcileService } from '@server/services/batch-generation/batch-generation-reconcile.service';
import { BatchGenerationReviewService } from '@server/services/batch-generation/batch-generation-review.service';
import { BatchGenerationStreamService } from '@server/services/batch-generation/batch-generation-stream.service';
import { BatchGenerationSummaryService } from '@server/services/batch-generation/batch-generation-summary.service';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import {
  AgentArtifactReferenceService,
  SERVER_TOKENS,
} from '@genfeedai/server';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BatchGenerationController],
  exports: [
    BatchGenerationCreditsService,
    BatchGenerationReconcileService,
    BatchGenerationService,
    BatchGenerationStreamService,
  ],
  imports: [
    AgentStreamPublisherModule,
    BrandsCoreModule,
    ConfigModule,
    ContentHarnessModule,
    ContentIntelligenceModule,
    CreditsModule,
    HarnessProfilesModule,
    LoggerModule,
    PostLifecycleModule,
    PostsCoreModule,
    PublishApprovalsModule,
  ],
  providers: [
    AgentArtifactReferenceService,
    BatchGenerationCreationService,
    BatchGenerationCreditsService,
    BatchGenerationProcessingService,
    BatchGenerationReconcileService,
    BatchGenerationReviewService,
    BatchGenerationService,
    BatchGenerationStreamService,
    BatchGenerationSummaryService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class BatchGenerationModule {}
