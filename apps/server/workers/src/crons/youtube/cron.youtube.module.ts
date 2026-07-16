import { PostsModule } from '@api/collections/posts/posts.module';
import { SocialInboxModule } from '@api/collections/social-inbox/social-inbox.module';
import { SystemWorkflowProvenanceService } from '@api/collections/workflows/services/system-workflow-provenance.service';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { WebhookClientModule } from '@api/services/webhook-client/webhook-client.module';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { PrismaService } from '@libs/prisma/prisma.service';
import { forwardRef, Module } from '@nestjs/common';
import { CronYoutubeAnalyticsService } from '@workers/crons/youtube/cron.youtube-analytics.service';
import { CronYoutubeMessagesService } from '@workers/crons/youtube/cron.youtube-messages.service';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';

@Module({
  imports: [
    forwardRef(() => PostsModule),
    forwardRef(() => WebhookClientModule),
    forwardRef(() => SocialInboxModule),
    forwardRef(() => WorkersQueuesModule),
    forwardRef(() => YoutubeModule),
    PrismaModule,
  ],
  exports: [CronYoutubeStatusService],
  providers: [
    CronYoutubeAnalyticsService,
    CronYoutubeMessagesService,
    CronYoutubeStatusService,
    SystemWorkflowProvenanceService,
    {
      inject: [PrismaService, LoggerService],
      provide: SchedulerPublishStateService,
      useFactory: (prisma: PrismaService, logger: LoggerService) =>
        new SchedulerPublishStateService(prisma, logger),
    },
  ],
})
export class CronYoutubeModule {}
