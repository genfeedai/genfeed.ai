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
import {
  Prompt,
  PromptSchema,
} from '@api/collections/prompts/schemas/prompt.schema';
import { PromptsService } from '@api/collections/prompts/services/prompts.service';
import { TemplatesModule } from '@api/collections/templates/templates.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { MarketplaceIntegrationModule } from '@api/marketplace-integration/marketplace-integration.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { PromptBuilderModule } from '@api/services/prompt-builder/prompt-builder.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [PromptsController, PromptsOperationsController],
  exports: [MongooseModule, PromptsService],
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
    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Prompt.name,
          useFactory: () => {
            const schema = PromptSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // User-scoped queries
            schema.index(
              { createdAt: -1, isDeleted: 1, user: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Brand-scoped queries
            schema.index(
              { brand: 1, createdAt: -1, isDeleted: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [PromptsService, CreditsGuard, CreditsInterceptor],
})
export class PromptsModule {}
