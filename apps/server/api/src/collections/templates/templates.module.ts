/**
 * Templates Module
 * Prompt templates with {{variables}}: content patterns like "Introducing {{product_name}}!".
 * Users fill variables → generate content. Supports AI suggestions and usage tracking.
 * NOTE: Different from Presets (which are saved PromptBar configurations).
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { TemplateMetadataModule } from '@api/collections/template-metadata/template-metadata.module';
import { TemplateUsageModule } from '@api/collections/template-usage/template-usage.module';
import { TemplatesController } from '@api/collections/templates/controllers/templates.controller';
import {
  Template,
  TemplateSchema,
} from '@api/collections/templates/schemas/template.schema';
import { TemplatesService } from '@api/collections/templates/services/templates.service';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [TemplatesController],
  exports: [TemplatesService],
  imports: [
    ByokModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => ReplicateModule),
    TemplateMetadataModule,
    forwardRef(() => TemplateUsageModule),

    MongooseModule.forFeatureAsync(
      [
        {
          name: Template.name,
          useFactory: () => {
            const schema = TemplateSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false }, sparse: true },
            );

            // User-scoped queries
            schema.index(
              { createdAt: -1, createdBy: 1, isDeleted: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Purpose-based queries
            schema.index({ createdAt: -1, isDeleted: 1, purpose: 1 });
            schema.index({ category: 1, isDeleted: 1, purpose: 1 });
            schema.index({ category: 1, isDeleted: 1 });

            schema.index({ industries: 1, platforms: 1 });
            schema.index({ isFeatured: 1, scope: 1 });
            schema.index({ rating: -1, usageCount: -1 }); // For popular templates
            schema.index({ description: 'text', key: 'text', label: 'text' }); // Text search includes key

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [TemplatesService, CreditsGuard, CreditsInterceptor],
})
export class TemplatesModule {}
