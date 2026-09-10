/**
 * Contexts Module
 * Brand knowledge storage and semantic retrieval for direct context injection.
 */
import { ContextsController } from '@api/collections/contexts/controllers/contexts.controller';
import { KnowledgeSourceGovernanceController } from '@api/collections/contexts/controllers/knowledge-source-governance.controller';
import { KnowledgeSourcesController } from '@api/collections/contexts/controllers/knowledge-sources.controller';
import { KnowledgeSpacesController } from '@api/collections/contexts/controllers/knowledge-spaces.controller';
import { ContextsService } from '@api/collections/contexts/services/contexts.service';
import { KnowledgeCaptureService } from '@api/collections/contexts/services/knowledge-capture.service';
import { KnowledgeLegacyBackfillService } from '@api/collections/contexts/services/knowledge-legacy-backfill.service';
import { KnowledgeRecordsService } from '@api/collections/contexts/services/knowledge-records.service';
import { KnowledgeSelectionService } from '@api/collections/contexts/services/knowledge-selection.service';
import { KnowledgeSourceIngestService } from '@api/collections/contexts/services/knowledge-source-ingest.service';
import { KnowledgeSourceIngestWorkflowService } from '@api/collections/contexts/services/knowledge-source-ingest-workflow.service';
import { MembersModule } from '@api/collections/members/members.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { RouterModule } from '@api/services/router/router.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    ContextsController,
    KnowledgeSourceGovernanceController,
    KnowledgeSourcesController,
    KnowledgeSpacesController,
  ],
  exports: [
    KnowledgeRecordsService,
    ContextsService,
    KnowledgeSourceIngestService,
    KnowledgeSourceIngestWorkflowService,
    KnowledgeCaptureService,
    KnowledgeSelectionService,
    KnowledgeLegacyBackfillService,
  ],
  imports: [
    ByokModule,
    ConfigModule,
    MembersModule,
    ReplicateModule,
    RouterModule,
    WorkflowsCoreModule,
  ],
  providers: [
    KnowledgeRecordsService,
    ContextsService,
    KnowledgeSourceIngestService,
    KnowledgeSourceIngestWorkflowService,
    KnowledgeCaptureService,
    KnowledgeSelectionService,
    KnowledgeLegacyBackfillService,
  ],
})
export class ContextsModule {}
