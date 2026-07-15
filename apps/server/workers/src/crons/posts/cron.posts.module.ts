import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { SystemWorkflowProvenanceService } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { PublishersModule } from '@api/services/integrations/publishers/publishers.module';
import { QuotaModule } from '@api/services/quota/quota.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import {
  AgentArtifactReferenceService,
  AgentScopeContextService,
  PublishApprovalsService,
  SERVER_TOKENS,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { PrismaService } from '@libs/prisma/prisma.service';
import { forwardRef, Module } from '@nestjs/common';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { SchedulerPublishStateService } from '@workers/crons/posts/scheduler-publish-state.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PostsModule),
    forwardRef(() => WebhookClientModule),
    PublishersModule,
    PrismaModule,
    QuotaModule,
    forwardRef(() => WorkersQueuesModule),
  ],
  exports: [CronPostsService],
  providers: [
    AgentArtifactReferenceService,
    CronPostsService,
    SchedulerPublishStateService,
    SystemWorkflowProvenanceService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
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
