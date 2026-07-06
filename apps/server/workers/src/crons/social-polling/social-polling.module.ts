import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { InstagramSocialAdapter } from '@api/collections/workflows/services/adapters/instagram-social.adapter';
import { TwitterSocialAdapter } from '@api/collections/workflows/services/adapters/twitter-social.adapter';
import { YoutubeSocialAdapter } from '@api/collections/workflows/services/adapters/youtube-social.adapter';
import { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { YoutubeModule } from '@api/services/integrations/youtube/youtube.module';
import { WORKFLOW_EXECUTION_QUEUE } from '@genfeedai/queue-contracts';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SocialPollingService } from '@workers/crons/social-polling/social-polling.service';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    CredentialsModule,
    InstagramModule,
    TwitterModule,
    YoutubeModule,
    BullModule.registerQueue({ name: WORKFLOW_EXECUTION_QUEUE }),
  ],
  providers: [
    SocialPollingService,
    WorkflowExecutionQueueService,
    TwitterSocialAdapter,
    InstagramSocialAdapter,
    YoutubeSocialAdapter,
  ],
})
export class SocialPollingModule {}
