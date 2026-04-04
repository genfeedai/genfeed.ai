import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { ReplyBotModule } from '@api/services/reply-bot/reply-bot.module';
import { TwitterPipelineController } from '@api/services/twitter-pipeline/twitter-pipeline.controller';
import { TwitterPipelineService } from '@api/services/twitter-pipeline/twitter-pipeline.service';
import { LoggerModule } from '@libs/logger/logger.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [TwitterPipelineController],
  exports: [TwitterPipelineService],
  imports: [
    forwardRef(() => CredentialsModule),
    LoggerModule,
    OpenRouterModule,
    forwardRef(() => ReplyBotModule),
    forwardRef(() => TwitterModule),
  ],
  providers: [TwitterPipelineService],
})
export class TwitterPipelineModule {}
