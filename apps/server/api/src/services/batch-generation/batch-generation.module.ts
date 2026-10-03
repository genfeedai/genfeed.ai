import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { ContentIntelligenceModule } from '@api/collections/content-intelligence/content-intelligence.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { PostGenerationModule } from '@api/collections/posts/post-generation.module';
import { PostLifecycleModule } from '@api/collections/posts/post-lifecycle.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { AgentArtifactReferenceService, SERVER_TOKENS } from '@api/index';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { AgentStreamPublisherModule } from '@api/services/agent-orchestrator/agent-stream-publisher.module';
import { AutonomousPublishingModule } from '@api/services/autonomous-publishing/autonomous-publishing.module';
import { BatchGenerationController } from '@api/services/batch-generation/batch-generation.controller';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { BatchGenerationCreationService } from '@api/services/batch-generation/batch-generation-creation.service';
import { BatchGenerationCreditsService } from '@api/services/batch-generation/batch-generation-credits.service';
import { BatchGenerationProcessingService } from '@api/services/batch-generation/batch-generation-processing.service';
import { BatchGenerationReconcileService } from '@api/services/batch-generation/batch-generation-reconcile.service';
import { BatchGenerationReviewService } from '@api/services/batch-generation/batch-generation-review.service';
import { BatchGenerationRewriteService } from '@api/services/batch-generation/batch-generation-rewrite.service';
import { BatchGenerationRewriteRunnerService } from '@api/services/batch-generation/batch-generation-rewrite-runner.service';
import { BatchGenerationStreamService } from '@api/services/batch-generation/batch-generation-stream.service';
import { BatchGenerationSummaryService } from '@api/services/batch-generation/batch-generation-summary.service';
import { BatchGenerationWorkflowService } from '@api/services/batch-generation/batch-generation-workflow.service';
import { BatchReviewLockService } from '@api/services/batch-generation/batch-review-lock';
import { BatchRewriteCreditsGuard } from '@api/services/batch-generation/batch-rewrite-credits.guard';
import { ByokModule } from '@api/services/byok/byok.module';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BATCH_REWRITE_QUEUE } from '@genfeedai/contracts/queue';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BatchGenerationController],
  exports: [
    BatchReviewLockService,
    BatchGenerationReviewService,
    BatchGenerationRewriteRunnerService,
    BatchGenerationCreditsService,
    BatchGenerationReconcileService,
    BatchGenerationService,
    BatchGenerationStreamService,
    BatchGenerationWorkflowService,
  ],
  imports: [
    PlatformSettingsModule,
    ActivityRecordingModule,
    PostGenerationModule,
    ModelsModule,
    ByokModule,
    NotificationsPublisherModule,
    AutonomousPublishingModule,
    AgentStreamPublisherModule,
    BrandsCoreModule,
    BullModule.registerQueue({
      defaultJobOptions: {
        // A retry resumes from the per-item progress persisted on the job.
        attempts: 2,
        backoff: { delay: 5000, type: 'exponential' },
        // Kept for a day so the Review page can read the final outcome.
        removeOnComplete: { age: 24 * 60 * 60 },
        removeOnFail: { age: 24 * 60 * 60 },
      },
      name: BATCH_REWRITE_QUEUE,
    }),
    ConfigModule,
    ContentHarnessModule,
    ContentIntelligenceModule,
    CreditsModule,
    HarnessProfilesModule,
    LoggerModule,
    PostLifecycleModule,
    PostsCoreModule,
    PublishApprovalsModule,
    WorkflowsCoreModule,
  ],
  providers: [
    BatchReviewLockService,
    CreditsGuard,
    BatchRewriteCreditsGuard,
    BatchGenerationRewriteService,
    BatchGenerationRewriteRunnerService,
    AgentArtifactReferenceService,
    BatchGenerationCreationService,
    BatchGenerationCreditsService,
    BatchGenerationProcessingService,
    BatchGenerationReconcileService,
    BatchGenerationReviewService,
    BatchGenerationService,
    BatchGenerationStreamService,
    BatchGenerationSummaryService,
    BatchGenerationWorkflowService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class BatchGenerationModule {}
