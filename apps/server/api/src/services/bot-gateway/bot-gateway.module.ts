import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { DiscordBotAdapter } from '@server/services/bot-gateway/adapters/discord-bot.adapter';
import { SlackBotAdapter } from '@server/services/bot-gateway/adapters/slack-bot.adapter';
import { TelegramBotAdapter } from '@server/services/bot-gateway/adapters/telegram-bot.adapter';
import { BotGatewayController } from '@api/services/bot-gateway/bot-gateway.controller';
import { BotGatewayService } from '@server/services/bot-gateway/bot-gateway.service';
import { BotGenerationService } from '@server/services/bot-gateway/services/bot-generation.service';
import { BotUserResolverService } from '@server/services/bot-gateway/services/bot-user-resolver.service';
import { SharedModule } from '@api/shared/shared.module';
import { ConfigModule } from '@libs/config/config.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BotGatewayController],
  exports: [BotGatewayService, BotGenerationService],
  imports: [
    ConfigModule,
    BrandsModule,
    CredentialsCoreModule,
    CreditsModule,
    HttpModule,
    IngredientsModule,
    MetadataModule,
    OrganizationSettingsModule,
    SharedModule,
  ],
  providers: [
    BotGatewayService,
    BotGenerationService,
    BotUserResolverService,
    DiscordBotAdapter,
    SlackBotAdapter,
    TelegramBotAdapter,
  ],
})
export class BotGatewayModule {}
