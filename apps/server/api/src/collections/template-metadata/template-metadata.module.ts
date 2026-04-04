/**
 * Template Metadata Module
 * Stores template properties and aggregated usage statistics
 * Service-only (no controller) - follows ingredient.metadata pattern
 */
import {
  TemplateMetadata,
  TemplateMetadataSchema,
} from '@api/collections/template-metadata/schemas/template-metadata.schema';
import { TemplateMetadataService } from '@api/collections/template-metadata/services/template-metadata.service';
import {
  Template,
  TemplateSchema,
} from '@api/collections/templates/schemas/template.schema';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [],
  exports: [MongooseModule, TemplateMetadataService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: TemplateMetadata.name,
          useFactory: () => {
            const schema = TemplateMetadataSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Query indexes
            schema.index({ difficulty: 1, isDeleted: 1 });
            schema.index({ isDeleted: 1, successRate: -1 });
            schema.index({ isDeleted: 1, lastUsed: -1 });
            schema.index({ isDeleted: 1, usageCount: -1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
    MongooseModule.forFeatureAsync(
      [
        {
          name: Template.name,
          useFactory: () => TemplateSchema,
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [TemplateMetadataService],
})
export class TemplateMetadataModule {}
