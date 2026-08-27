/**
 * Contexts Module
 * Brand knowledge storage and semantic retrieval for direct context injection.
 */
import { ContextsController } from '@api/collections/contexts/controllers/contexts.controller';
import { ContextsService } from '@server/collections/contexts/services/contexts.service';
import { KnowledgeSourceService } from '@server/collections/contexts/services/knowledge-source.service';
import { KnowledgeSourceIngestService } from '@server/collections/contexts/services/knowledge-source-ingest.service';
import { KnowledgeSourceIngestQueueModule } from '@api/queues/knowledge-source-ingest/knowledge-source-ingest-queue.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { RouterModule } from '@api/services/router/router.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [ContextsController],
  exports: [
    ContextsService,
    KnowledgeSourceIngestService,
    KnowledgeSourceService,
  ],
  imports: [
    ByokModule,
    ConfigModule,
    KnowledgeSourceIngestQueueModule,
    ReplicateModule,
    RouterModule,
  ],
  providers: [
    ContextsService,
    KnowledgeSourceIngestService,
    KnowledgeSourceService,
  ],
})
export class ContextsModule {}
