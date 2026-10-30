import { ClipperProjectGenerationController } from '@api/collections/clipper-projects/clipper-project-generation.controller';
import { ClipperProjectHandoffsController } from '@api/collections/clipper-projects/clipper-project-handoffs.controller';
import { ClipperProjectHighlightsController } from '@api/collections/clipper-projects/clipper-project-highlights.controller';
import { ClipperProjectIngestionController } from '@api/collections/clipper-projects/clipper-project-ingestion.controller';
import { ClipperProjectPublicToolController } from '@api/collections/clipper-projects/clipper-project-public-tool.controller';
import { ClipperProjectReferenceFramesController } from '@api/collections/clipper-projects/clipper-project-reference-frames.controller';
import { ClipperProjectsController } from '@api/collections/clipper-projects/clipper-projects.controller';
import { ClipperProjectsCoreModule } from '@api/collections/clipper-projects/clipper-projects-core.module';
import { ClipperHandoffWorkflowService } from '@api/collections/clipper-projects/services/clipper-handoff-workflow.service';
import { ClipperProjectClientSourceService } from '@api/collections/clipper-projects/services/clipper-project-client-source.service';
import { ClipperProjectLibrarySourceService } from '@api/collections/clipper-projects/services/clipper-project-library-source.service';
import { PublicYoutubeClipperClaimService } from '@api/collections/clipper-projects/services/public-youtube-clipper-claim.service';
import { ClipperResultsModule } from '@api/collections/clipper-results/clipper-results.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { EditorProjectsModule } from '@api/collections/editor-projects/editor-projects.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { PublicClipperToolStoreModule } from '@api/services/public-clipper-tool/public-clipper-tool-store.module';
import { UploadsModule } from '@api/services/uploads/uploads.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    ClipperProjectIngestionController,
    ClipperProjectHighlightsController,
    ClipperProjectHandoffsController,
    ClipperProjectPublicToolController,
    ClipperProjectReferenceFramesController,
    ClipperProjectGenerationController,
    ClipperProjectsController,
  ],
  exports: [ClipperProjectsCoreModule],
  imports: [
    HttpModule,
    ClipperProjectsCoreModule,
    ClipperResultsModule,
    CreditsModule,
    EditorProjectsModule,
    IngredientsModule,
    PublicClipperToolStoreModule,
    UploadsModule,
    WorkflowsModule,
  ],
  providers: [
    ClipperProjectClientSourceService,
    ClipperProjectLibrarySourceService,
    ClipperHandoffWorkflowService,
    PublicYoutubeClipperClaimService,
  ],
})
export class ClipperProjectsModule {}
