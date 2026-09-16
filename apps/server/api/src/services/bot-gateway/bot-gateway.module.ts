import { BrandsModule } from '@api/collections/brands/brands.module';
import { CredentialsCoreModule } from '@api/collections/credentials/credentials-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { AgentGenerationGatewayModule } from '@api/services/agent-generation-gateway/agent-generation-gateway.module';
import { BotCallbackModule } from '@api/services/bot-gateway/bot-callback.module';
import { BotGatewayController } from '@api/services/bot-gateway/bot-gateway.controller';
import { BotGatewayService } from '@api/services/bot-gateway/bot-gateway.service';
import { BotMediaGenerationDispatcherService } from '@api/services/bot-gateway/bot-media-generation-dispatcher.service';
import { BotGenerationService } from '@api/services/bot-gateway/services/bot-generation.service';
import { BOT_MEDIA_GENERATION_DISPATCHER } from '@api/services/bot-gateway/services/bot-media-generation-dispatcher.interface';
import { BotUserResolverService } from '@api/services/bot-gateway/services/bot-user-resolver.service';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BotGatewayController],
  exports: [BotGatewayService, BotGenerationService],
  imports: [
    ConfigModule,
    AgentGenerationGatewayModule,
    BotCallbackModule,
    BrandsModule,
    CredentialsCoreModule,
    CreditsModule,
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
  ],
})
export class BotGatewayModule {}
