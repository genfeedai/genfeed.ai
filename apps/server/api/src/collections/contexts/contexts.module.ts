/**
 * Contexts Module (RAG System)
 * Retrieval Augmented Generation: brand voice knowledge bases, content library indexing,
 * semantic search with embeddings, and prompt enhancement for 50% better AI results.
 */
import { ContextsController } from '@api/collections/contexts/controllers/contexts.controller';
import {
  ContextBase,
  ContextBaseSchema,
} from '@api/collections/contexts/schemas/context-base.schema';
import {
  ContextEntry,
  ContextEntrySchema,
} from '@api/collections/contexts/schemas/context-entry.schema';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { Post, PostSchema } from '@api/collections/posts/schemas/post.schema';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [ContextsController],
  exports: [ContextsService],
  imports: [
    ByokModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    ReplicateModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: ContextBase.name,
          useFactory: () => {
            const schema = ContextBaseSchema;

            // Primary query with soft delete
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Creator lookup
            schema.index({ createdBy: 1 });

            // Category + Active status
            schema.index({ category: 1, isActive: 1 });

            // Text search
            schema.index({ description: 'text', label: 'text' });

            return schema;
          },
        },
        {
          name: ContextEntry.name,
          useFactory: () => {
            const schema = ContextEntrySchema;

            // Primary query with soft delete
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Context base entries with soft delete
            schema.index(
              { contextBase: 1, isDeleted: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Organization + Context base queries
            schema.index({ contextBase: 1, organization: 1 });

            // Source metadata lookup
            schema.index({ 'metadata.source': 1, 'metadata.sourceId': 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
    MongooseModule.forFeature(
      [{ name: Post.name, schema: PostSchema }],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [ContextsService, CreditsGuard, CreditsInterceptor],
})
export class ContextsModule {}
