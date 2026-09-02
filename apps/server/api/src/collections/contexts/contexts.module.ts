/**
 * Contexts Module
 * Brand knowledge storage and semantic retrieval for direct context injection.
 */
import { ContextsController } from '@api/collections/contexts/controllers/contexts.controller';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { KnowledgeSourceService } from '@api/collections/contexts/services/knowledge-source.service';
import { KnowledgeSourceIngestService } from '@api/collections/contexts/services/knowledge-source-ingest.service';
import { KnowledgeSourceIngestWorkflowService } from '@api/collections/contexts/services/knowledge-source-ingest-workflow.service';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
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
    KnowledgeSourceIngestWorkflowService,
    KnowledgeSourceService,
  ],
  imports: [
    ByokModule,
    ConfigModule,
    ReplicateModule,
    RouterModule,
    WorkflowsCoreModule,
  ],
  providers: [
    ContextsService,
    KnowledgeSourceIngestService,
    KnowledgeSourceIngestWorkflowService,
    KnowledgeSourceService,
  ],
})
export class ContextsModule {}
