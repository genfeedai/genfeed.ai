import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { PersonasModule } from '@api/collections/personas/personas.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AiInfluencerController } from '@api/services/ai-influencer/ai-influencer.controller';
import { AiInfluencerService } from '@api/services/ai-influencer/ai-influencer.service';
import { AiInfluencerWorkflowService } from '@api/services/ai-influencer/ai-influencer-workflow.service';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { InstagramModule } from '@api/services/integrations/instagram/instagram.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { TwitterModule } from '@api/services/integrations/twitter/twitter.module';
import { PersonaContentModule } from '@api/services/persona-content/persona-content.module';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AiInfluencerController],
  exports: [AiInfluencerService, AiInfluencerWorkflowService],
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
    WorkflowsModule,
  ],
  providers: [
    AiInfluencerService,
    AiInfluencerWorkflowService,
    IpWhitelistGuard,
    SuperAdminGuard,
  ],
})
export class AiInfluencerModule {}
