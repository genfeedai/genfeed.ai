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
import { TurboRunController } from '@api/services/turbo-run/turbo-run.controller';
import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import { TurboRunCreationService } from '@api/services/turbo-run/turbo-run-creation.service';
import { TurboRunCreditsService } from '@api/services/turbo-run/turbo-run-credits.service';
import { TurboRunProcessingService } from '@api/services/turbo-run/turbo-run-processing.service';
import { TurboRunReconcileService } from '@api/services/turbo-run/turbo-run-reconcile.service';
import { TurboRunReviewService } from '@api/services/turbo-run/turbo-run-review.service';
import { TurboRunRewriteService } from '@api/services/turbo-run/turbo-run-rewrite.service';
import { TurboRunRewriteRunnerService } from '@api/services/turbo-run/turbo-run-rewrite-runner.service';
import { TurboRunStreamService } from '@api/services/turbo-run/turbo-run-stream.service';
import { TurboRunSummaryService } from '@api/services/turbo-run/turbo-run-summary.service';
import { TurboRunWorkflowService } from '@api/services/turbo-run/turbo-run-workflow.service';
import { TurboRunReviewLockService } from '@api/services/turbo-run/turbo-run-review-lock';
import { TurboRewriteCreditsGuard } from '@api/services/turbo-run/turbo-rewrite-credits.guard';
import { ByokModule } from '@api/services/byok/byok.module';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TURBO_REWRITE_QUEUE } from '@genfeedai/contracts/queue';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { LoggerService } from '@libs/logger/logger.service';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  controllers: [TurboRunController],
  exports: [
    TurboRunReviewLockService,
    TurboRunReviewService,
    TurboRunRewriteRunnerService,
    TurboRunCreditsService,
    TurboRunReconcileService,
    TurboRunService,
    TurboRunStreamService,
    TurboRunWorkflowService,
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
      name: TURBO_REWRITE_QUEUE,
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
    TurboRunReviewLockService,
    CreditsGuard,
    TurboRewriteCreditsGuard,
    TurboRunRewriteService,
    TurboRunRewriteRunnerService,
    AgentArtifactReferenceService,
    TurboRunCreationService,
    TurboRunCreditsService,
    TurboRunProcessingService,
    TurboRunReconcileService,
    TurboRunReviewService,
    TurboRunService,
    TurboRunStreamService,
    TurboRunSummaryService,
    TurboRunWorkflowService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class TurboRunModule {}
