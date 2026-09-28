import { BatchProjectsController } from '@api/collections/batch-projects/controllers/batch-projects.controller';
import { BatchProjectCreditsService } from '@api/collections/batch-projects/services/batch-project-credits.service';
import { BatchProjectIdeaDispatchService } from '@api/collections/batch-projects/services/batch-project-idea-dispatch.service';
import { BatchProjectIdeaGenerationService } from '@api/collections/batch-projects/services/batch-project-idea-generation.service';
import { BatchProjectQuoteService } from '@api/collections/batch-projects/services/batch-project-quote.service';
import { BatchProjectReconcileService } from '@api/collections/batch-projects/services/batch-project-reconcile.service';
import { BatchProjectSchedulingService } from '@api/collections/batch-projects/services/batch-project-scheduling.service';
import { BatchProjectsService } from '@api/collections/batch-projects/services/batch-projects.service';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ImagesModule } from '@api/collections/images/images.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { RouterModule } from '@api/services/router/router.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [BatchProjectsController],
  exports: [BatchProjectReconcileService],
  imports: [
    BatchGenerationModule,
    BrandsCoreModule,
    ByokModule,
    CreditsModule,
    ImagesModule,
    LoggerModule,
    ModelsModule,
    PostsCoreModule,
    RouterModule,
    VideoGenerationModule,
    VideosModule,
    WorkflowsCoreModule,
    WorkflowsModule,
  ],
  providers: [
    AgentGenerationEstimateService,
    BatchProjectCreditsService,
    BatchProjectIdeaDispatchService,
    BatchProjectIdeaGenerationService,
    BatchProjectQuoteService,
    BatchProjectReconcileService,
    BatchProjectSchedulingService,
    BatchProjectsService,
  ],
})
export class BatchProjectsModule {}
