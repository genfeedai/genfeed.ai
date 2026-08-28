/**
 * Contexts Module
 * Brand knowledge storage and semantic retrieval for direct context injection.
 */
import { ContextsController } from '@api/collections/contexts/controllers/contexts.controller';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { RouterModule } from '@api/services/router/router.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';
import { ContextsService } from '@server/collections/contexts/services/contexts.service';
import { KnowledgeSourceService } from '@server/collections/contexts/services/knowledge-source.service';
import { KnowledgeSourceIngestService } from '@server/collections/contexts/services/knowledge-source-ingest.service';
import { KnowledgeSourceIngestWorkflowService } from '@server/collections/contexts/services/knowledge-source-ingest-workflow.service';

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
    WorkflowsModule,
  ],
  providers: [
    ContextsService,
    KnowledgeSourceIngestService,
    KnowledgeSourceIngestWorkflowService,
    KnowledgeSourceService,
  ],
})
export class ContextsModule {}
