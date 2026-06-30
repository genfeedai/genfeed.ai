import { ClipProjectsController } from '@api/collections/clip-projects/clip-projects.controller';
import { ClipProjectsCoreModule } from '@api/collections/clip-projects/clip-projects-core.module';
import { ClipResultsModule } from '@api/collections/clip-results/clip-results.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { EditorProjectsModule } from '@api/collections/editor-projects/editor-projects.module';
import { ClipAnalyzeModule } from '@api/queues/clip-analyze/clip-analyze.module';
import { ClipFactoryModule } from '@api/queues/clip-factory/clip-factory.module';
import { ClipOrchestratorModule } from '@api/services/clip-orchestrator/clip-orchestrator.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ClipProjectsController],
  exports: [ClipProjectsCoreModule],
  imports: [
    forwardRef(() => ClipProjectsCoreModule),
    forwardRef(() => ClipResultsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => EditorProjectsModule),
    forwardRef(() => ClipAnalyzeModule),
    forwardRef(() => ClipFactoryModule),
    forwardRef(() => ClipOrchestratorModule),
  ],
})
export class ClipProjectsModule {}
