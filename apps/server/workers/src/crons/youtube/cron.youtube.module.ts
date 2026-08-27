import { SystemWorkflowProvenanceService } from '@server/collections/workflows/system-workflow-provenance.service';
import { PostLifecycleService } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaModule } from '@libs/prisma/prisma.module';
import { PrismaService } from '@libs/prisma/prisma.service';
import { forwardRef, Module } from '@nestjs/common';
import { CronYoutubeMessagesService } from '@workers/crons/youtube/cron.youtube-messages.service';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { WorkersQueuesModule } from '@workers/queues/queues.module';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';
import { SocialIntegrationsModule } from '@workers/services/social-integrations.module';
import { WorkersDomainModule } from '@server/workers-domain.module';

@Module({
  imports: [
    WorkersDomainModule,
    forwardRef(() => WorkersQueuesModule),
    SocialIntegrationsModule,
    PrismaModule,
  ],
  exports: [CronYoutubeStatusService],
  providers: [
    CronYoutubeMessagesService,
    CronYoutubeStatusService,
    SystemWorkflowProvenanceService,
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
export class CronYoutubeModule {}
