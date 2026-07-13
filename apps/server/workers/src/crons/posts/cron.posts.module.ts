import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { PublishApprovalsModule } from '@api/collections/publish-approvals/publish-approvals.module';
import { SystemWorkflowProvenanceService } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { PublishersModule } from '@api/services/integrations/publishers/publishers.module';
import { QuotaModule } from '@api/services/quota/quota.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import {
  AgentArtifactReferenceService,
  AgentScopeContextService,
  SERVER_TOKENS,
} from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { PrismaService } from '@libs/prisma/prisma.service';
import { forwardRef, Module } from '@nestjs/common';
import { CronPostsService } from '@workers/crons/posts/cron.posts.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';

@Module({
  imports: [
    forwardRef(() => ActivitiesModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => PostsModule),
    PublishApprovalsModule,
    forwardRef(() => WebhookClientModule),
    PublishersModule,
    PrismaModule,
    QuotaModule,
    forwardRef(() => WorkersQueuesModule),
  ],
  exports: [CronPostsService],
  providers: [
    AgentArtifactReferenceService,
    AgentScopeContextService,
    CronPostsService,
    SystemWorkflowProvenanceService,
    { provide: SERVER_TOKENS.logger, useExisting: LoggerService },
    { provide: SERVER_TOKENS.prisma, useExisting: PrismaService },
  ],
})
export class CronPostsModule {}
