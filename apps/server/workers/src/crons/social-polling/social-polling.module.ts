import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import {
  Workflow,
  WorkflowSchema,
} from '@api/collections/workflows/schemas/workflow.schema';
import { InstagramSocialAdapter } from '@api/collections/workflows/services/adapters/instagram-social.adapter';
import { TwitterSocialAdapter } from '@api/collections/workflows/services/adapters/twitter-social.adapter';
import {
  WORKFLOW_EXECUTION_QUEUE,
  WorkflowExecutionQueueService,
} from '@api/collections/workflows/services/workflow-execution-queue.service';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SocialPollingService } from '@workers/crons/social-polling/social-polling.service';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    CredentialsModule,
    InstagramModule,
    TwitterModule,
    MongooseModule.forFeature(
      [{ name: Workflow.name, schema: WorkflowSchema }],
      DB_CONNECTIONS.CLOUD,
    ),
    BullModule.registerQueue({ name: WORKFLOW_EXECUTION_QUEUE }),
  ],
  providers: [
    SocialPollingService,
    WorkflowExecutionQueueService,
    TwitterSocialAdapter,
    InstagramSocialAdapter,
  ],
})
export class SocialPollingModule {}
