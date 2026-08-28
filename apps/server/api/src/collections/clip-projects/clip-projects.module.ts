import { ClipProjectHandoffsController } from '@api/collections/clip-projects/clip-project-handoffs.controller';
import { ClipProjectHighlightsController } from '@api/collections/clip-projects/clip-project-highlights.controller';
import { ClipProjectIngestionController } from '@api/collections/clip-projects/clip-project-ingestion.controller';
import { ClipProjectPublicToolController } from '@api/collections/clip-projects/clip-project-public-tool.controller';
import { ClipProjectReferenceFramesController } from '@api/collections/clip-projects/clip-project-reference-frames.controller';
import { ClipProjectsController } from '@api/collections/clip-projects/clip-projects.controller';
import { ClipProjectsCoreModule } from '@api/collections/clip-projects/clip-projects-core.module';
import { ClipHandoffWorkflowService } from '@api/collections/clip-projects/services/clip-handoff-workflow.service';
import { ClipProjectIngestionService } from '@api/collections/clip-projects/services/clip-project-ingestion.service';
import { PublicYoutubeClipClaimService } from '@api/collections/clip-projects/services/public-youtube-clip-claim.service';
import { ClipResultsModule } from '@api/collections/clip-results/clip-results.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { EditorProjectsModule } from '@api/collections/editor-projects/editor-projects.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { ClipAnalyzeModule } from '@api/queues/clip-analyze/clip-analyze.module';
import { ClipFactoryModule } from '@api/queues/clip-factory/clip-factory.module';
import { PublicClipToolStoreModule } from '@api/services/public-clip-tool/public-clip-tool-store.module';
import { UploadsModule } from '@api/services/uploads/uploads.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    ClipProjectIngestionController,
    ClipProjectHighlightsController,
    ClipProjectHandoffsController,
    ClipProjectPublicToolController,
    ClipProjectReferenceFramesController,
    ClipProjectsController,
  ],
  exports: [ClipProjectsCoreModule],
  imports: [
    ClipProjectsCoreModule,
    ClipResultsModule,
    CreditsModule,
    EditorProjectsModule,
    IngredientsModule,
    ClipAnalyzeModule,
    ClipFactoryModule,
    PublicClipToolStoreModule,
    UploadsModule,
    WorkflowsModule,
  ],
  providers: [
    ClipProjectIngestionService,
    ClipHandoffWorkflowService,
    PublicYoutubeClipClaimService,
  ],
})
export class ClipProjectsModule {}
