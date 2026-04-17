/**
 * Prompts Module
 * AI generation prompts: store user prompts, track prompt versions,
prompt templates, and generation history.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { PromptsController } from '@api/collections/prompts/controllers/prompts.controller';
import { PromptsOperationsController } from '@api/collections/prompts/controllers/prompts-operations.controller';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [PromptsController, PromptsOperationsController],
  exports: [PromptsService],
  imports: [
    forwardRef(() => ActivitiesModule),
    ByokModule,
    PromptBuilderModule,
    ReplicateModule,
    OpenRouterModule,

    WhisperModule,

    forwardRef(() => BrandsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MarketplaceIntegrationModule),
    ModelsModule,
    forwardRef(() => TemplatesModule),
  ],
  providers: [PromptsService, CreditsGuard, CreditsInterceptor],
})
export class PromptsModule {}
