/**
 * Contexts Module (RAG System)
 * Retrieval Augmented Generation: brand voice knowledge bases, content library indexing,
 * semantic search with embeddings, and prompt enhancement for 50% better AI results.
 */
import { ContextsController } from '@api/collections/contexts/controllers/contexts.controller';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { ConfigModule } from '@api/config/config.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ContextsController],
  exports: [ContextsService],
  imports: [
    ByokModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    ReplicateModule,
  ],
  providers: [ContextsService, CreditsGuard, CreditsInterceptor],
})
export class ContextsModule {}
