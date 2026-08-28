import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ImagesModule } from '@api/collections/images/images.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { CreditDeductionModule } from '@api/queues/credit-deduction/credit-deduction.module';
import { BotGatewayController } from '@api/services/bot-gateway/bot-gateway.controller';
import { BotMediaGenerationDispatcherService } from '@api/services/bot-gateway/bot-media-generation-dispatcher.service';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { DiscordBotAdapter } from '@server/services/bot-gateway/adapters/discord-bot.adapter';
import { SlackBotAdapter } from '@server/services/bot-gateway/adapters/slack-bot.adapter';
import { TelegramBotAdapter } from '@server/services/bot-gateway/adapters/telegram-bot.adapter';
import { BotGatewayService } from '@server/services/bot-gateway/bot-gateway.service';
import { BotGenerationService } from '@server/services/bot-gateway/services/bot-generation.service';
import { BOT_MEDIA_GENERATION_DISPATCHER } from '@server/services/bot-gateway/services/bot-media-generation-dispatcher.interface';
import { BotUserResolverService } from '@server/services/bot-gateway/services/bot-user-resolver.service';

@Module({
  controllers: [BotGatewayController],
  exports: [BotGatewayService, BotGenerationService],
  imports: [
    ConfigModule,
    BrandsModule,
    CredentialsCoreModule,
    CreditsModule,
    CreditDeductionModule,
    HttpModule,
    ImagesModule,
    VideosModule,
  ],
  providers: [
    BotGatewayService,
    BotGenerationService,
    BotMediaGenerationDispatcherService,
    {
      provide: BOT_MEDIA_GENERATION_DISPATCHER,
      useExisting: BotMediaGenerationDispatcherService,
    },
    BotUserResolverService,
    DiscordBotAdapter,
    SlackBotAdapter,
    TelegramBotAdapter,
  ],
})
export class BotGatewayModule {}
