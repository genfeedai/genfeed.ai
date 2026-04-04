/**
 * Template Usage Module
 * Tracks individual template usage records with generated content and feedback
 * Service-only (no controller) - follows template-metadata pattern
 */
import {
  TemplateUsage,
  TemplateUsageSchema,
} from '@api/collections/template-usage/schemas/template-usage.schema';
import { TemplateUsageService } from '@api/collections/template-usage/services/template-usage.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [],
  exports: [MongooseModule, TemplateUsageService],
  imports: [
    MongooseModule.forFeatureAsync(
      [
        {
          name: TemplateUsage.name,
          useFactory: () => {
            const schema = TemplateUsageSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Organization + Template + Date queries
            schema.index({ createdAt: -1, organization: 1, template: 1 });

            // User usage history
            schema.index({ createdAt: -1, user: 1 });

            // Template rating analysis
            schema.index({ rating: 1, template: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [TemplateUsageService],
})
export class TemplateUsageModule {}
