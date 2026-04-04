import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsModule } from '@api/collections/credentials/credentials.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { ConfigModule } from '@api/config/config.module';
import { DiscordBotAdapter } from '@api/services/bot-gateway/adapters/discord-bot.adapter';
import { SlackBotAdapter } from '@api/services/bot-gateway/adapters/slack-bot.adapter';
import { TelegramBotAdapter } from '@api/services/bot-gateway/adapters/telegram-bot.adapter';
import { BotGatewayController } from '@api/services/bot-gateway/bot-gateway.controller';
import { BotGatewayService } from '@api/services/bot-gateway/bot-gateway.service';
import { BotGenerationService } from '@api/services/bot-gateway/services/bot-generation.service';
import { BotUserResolverService } from '@api/services/bot-gateway/services/bot-user-resolver.service';
import { SharedModule } from '@api/shared/shared.module';
import { HttpModule } from '@nestjs/axios';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [BotGatewayController],
  exports: [BotGatewayService, BotGenerationService],
  imports: [
    ConfigModule,
    forwardRef(() => BrandsModule),
    forwardRef(() => CredentialsModule),
    forwardRef(() => CreditsModule),
    HttpModule,
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => SharedModule),
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
