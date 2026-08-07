import { BrandsModule } from '@api/collections/brands/brands.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { AgentStreamPublisherModule } from '@api/services/agent-orchestrator/agent-stream-publisher.module';
import { BatchGenerationController } from '@api/services/batch-generation/batch-generation.controller';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { BatchGenerationCreationService } from '@api/services/batch-generation/batch-generation-creation.service';
import { BatchGenerationCreditsService } from '@api/services/batch-generation/batch-generation-credits.service';
import { BatchGenerationProcessingService } from '@api/services/batch-generation/batch-generation-processing.service';
import { BatchGenerationReconcileService } from '@api/services/batch-generation/batch-generation-reconcile.service';
import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { BatchGenerationStreamService } from '@api/services/batch-generation/batch-generation-stream.service';
import { BatchGenerationSummaryService } from '@api/services/batch-generation/batch-generation-summary.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  AgentArtifactReferenceService,
  SERVER_TOKENS,
} from '@genfeedai/server';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [BatchGenerationController],
  exports: [
    BatchGenerationCreditsService,
    BatchGenerationReconcileService,
    BatchGenerationService,
    BatchGenerationStreamService,
  ],
  imports: [
    forwardRef(() => AgentStreamPublisherModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => ConfigModule),
    forwardRef(() => ContentIntelligenceModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => HarnessProfilesModule),
    forwardRef(() => LoggerModule),
    forwardRef(() => PostsModule),
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
