import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { ScheduledPostWorkflowQueueService } from '@api/collections/posts/services/scheduled-post-workflow-queue.service';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import {
  AgentArtifactReferenceService,
  AgentScopeContextService,
  PostLifecycleService,
  PublishApprovalsService,
  SERVER_TOKENS,
} from '@api/index';
import { PublishersModule } from '@api/services/integrations/publishers/publishers.module';
import { QuotaModule } from '@api/services/quota/quota.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { PrismaService } from '@libs/prisma/prisma.service';
import { forwardRef, Module } from '@nestjs/common';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';
import { PostRepeatSchedulerService } from '@workers/services/post-repeat-scheduler.service';
import { ReleaseRecurrenceMaterializerService } from '@workers/services/release-recurrence-materializer.service';
import { ScheduledPostDeliveryService } from '@workers/services/scheduled-post-delivery.service';
import { ScheduledPostDiscoveryService } from '@workers/services/scheduled-post-discovery.service';
import { ScheduledPostExecutionGuardService } from '@workers/services/scheduled-post-execution-guard.service';
import { ScheduledPostWorkflowService } from '@workers/services/scheduled-post-workflow.service';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

@Module({
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => WebhookClientModule),
    PublishersModule,
    QuotaModule,
    forwardRef(() => ReplyBotModule),
    PrismaModule,
    forwardRef(() => WorkersQueuesModule),
    forwardRef(() => WorkflowsModule),
  ],
  exports: [CronPostsService, ScheduledPostWorkflowService],
  providers: [
    AgentArtifactReferenceService,
    CronPostsService,
    PostRepeatSchedulerService,
    ScheduledPostDeliveryService,
    ScheduledPostDiscoveryService,
    ScheduledPostExecutionGuardService,
    ScheduledPostWorkflowQueueService,
    ScheduledPostWorkflowService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
    {
      inject: [PrismaService, LoggerService, PostLifecycleService],
      provide: SchedulerPublishStateService,
      useFactory: (
        prisma: PrismaService,
        logger: LoggerService,
        postLifecycleService: PostLifecycleService,
      ) =>
        new SchedulerPublishStateService(prisma, logger, postLifecycleService),
    },
    {
      inject: [PrismaService, LoggerService, PublishApprovalsService],
      provide: ReleaseRecurrenceMaterializerService,
      useFactory: (
        prisma: PrismaService,
        logger: LoggerService,
        approvals: PublishApprovalsService,
      ) => new ReleaseRecurrenceMaterializerService(prisma, logger, approvals),
    },
    {
      inject: [PrismaService, LoggerService],
      provide: AgentScopeContextService,
      useFactory: (prisma: PrismaService, logger: LoggerService) =>
        new AgentScopeContextService(prisma, logger),
    },
    {
      inject: [PrismaService, AgentArtifactReferenceService, LoggerService],
      provide: PublishApprovalsService,
      useFactory: (
        prisma: PrismaService,
        artifactReferenceService: AgentArtifactReferenceService,
        logger: LoggerService,
      ) =>
        new PublishApprovalsService(prisma, artifactReferenceService, logger),
    },
  ],
})
export class CronPostsModule {}
