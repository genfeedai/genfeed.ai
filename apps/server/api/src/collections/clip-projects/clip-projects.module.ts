import { ClipProjectHandoffsController } from '@api/collections/clip-projects/clip-project-handoffs.controller';
import { ClipProjectHighlightsController } from '@api/collections/clip-projects/clip-project-highlights.controller';
import { ClipProjectReferenceFramesController } from '@api/collections/clip-projects/clip-project-reference-frames.controller';
import { ClipProjectsController } from '@api/collections/clip-projects/clip-projects.controller';
import { ClipProjectsCoreModule } from '@api/collections/clip-projects/clip-projects-core.module';
import { ClipResultsModule } from '@api/collections/clip-results/clip-results.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { EditorProjectsModule } from '@api/collections/editor-projects/editor-projects.module';
import { ClipAnalyzeModule } from '@api/queues/clip-analyze/clip-analyze.module';
import { ClipFactoryModule } from '@api/queues/clip-factory/clip-factory.module';
import { ClipOrchestratorModule } from '@api/services/clip-orchestrator/clip-orchestrator.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    ClipProjectHighlightsController,
    ClipProjectHandoffsController,
    ClipProjectReferenceFramesController,
    ClipProjectsController,
  ],
  exports: [ClipProjectsCoreModule],
  imports: [
    ClipProjectsCoreModule,
    ClipResultsModule,
    CreditsModule,
    EditorProjectsModule,
    ClipAnalyzeModule,
    ClipFactoryModule,
    ClipOrchestratorModule,
  ],
})
export class ClipProjectsModule {}
