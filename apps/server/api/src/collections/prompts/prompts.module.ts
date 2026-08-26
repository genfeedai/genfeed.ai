/**
 * Prompts Module
 * AI generation prompts: store user prompts, track prompt versions,
prompt templates, and generation history.
 */
import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { PromptsController } from '@api/collections/prompts/controllers/prompts.controller';
import { PromptsOperationsController } from '@api/collections/prompts/controllers/prompts-operations.controller';
import { PromptsTransformationsController } from '@api/collections/prompts/controllers/prompts-transformations.controller';
import { PromptsCoreModule } from '@api/collections/prompts/prompts-core.module';
import { PromptTransformationService } from '@api/collections/prompts/services/prompt-transformation.service';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    PromptsTransformationsController,
    PromptsOperationsController,
    PromptsController,
  ],
  exports: [PromptsCoreModule],
  imports: [
    PromptsCoreModule,
    ActivitiesModule,
    BrandsCoreModule,
    ByokModule,
    CreditsModule,
    IngredientsModule,
    MarketplaceIntegrationModule,
    ModelsModule,
    OpenRouterModule,
    PromptBuilderModule,
    ReplicateModule,
    TemplatesModule,
    WhisperModule,
  ],
  providers: [PromptTransformationService, CreditsGuard, CreditsInterceptor],
})
export class PromptsModule {}
