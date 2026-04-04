import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { ConfigModule } from '@api/config/config.module';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AiInfluencerController } from '@api/services/ai-influencer/ai-influencer.controller';
import { AiInfluencerService } from '@api/services/ai-influencer/ai-influencer.service';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { PersonaContentModule } from '@api/services/persona-content/persona-content.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AiInfluencerController],
  exports: [AiInfluencerService],
  imports: [
    ConfigModule,
    LoggerModule,
    PersonasModule,
    IngredientsModule,
    FalModule,
    OpenRouterModule,
    InstagramModule,
    TwitterModule,
    PersonaContentModule,
  ],
  providers: [AiInfluencerService, IpWhitelistGuard],
})
export class AiInfluencerModule {}
