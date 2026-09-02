import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { PostLifecycleService } from '@api/index';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { PrismaService } from '@libs/prisma/prisma.service';
import { forwardRef, Module } from '@nestjs/common';
import { CronPostsModule } from '@workers/crons/posts/cron.posts.module';
import { CronTiktokStatusService } from '@workers/crons/tiktok/cron.tiktok-status.service';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';
import { SocialIntegrationsModule } from '@workers/services/social-integrations.module';

@Module({
  imports: [
    forwardRef(() => CredentialsModule),
    CronPostsModule,
    forwardRef(() => PostsModule),
    forwardRef(() => WebhookClientModule),
    forwardRef(() => WorkflowsModule),
    SocialIntegrationsModule,
    PrismaModule,
  ],
  exports: [CronTiktokStatusService],
  providers: [
    CronTiktokStatusService,
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
  ],
})
export class CronTiktokModule {}
