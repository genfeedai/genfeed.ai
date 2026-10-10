import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ImagesModule } from '@api/collections/images/images.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { PostsCoreModule } from '@api/collections/posts/posts-core.module';
import { TurboProjectsController } from '@api/collections/turbo-projects/controllers/turbo-projects.controller';
import { TurboProjectCreditsService } from '@api/collections/turbo-projects/services/turbo-project-credits.service';
import { TurboProjectIdeaDispatchService } from '@api/collections/turbo-projects/services/turbo-project-idea-dispatch.service';
import { TurboProjectIdeaGenerationService } from '@api/collections/turbo-projects/services/turbo-project-idea-generation.service';
import { TurboProjectQuoteService } from '@api/collections/turbo-projects/services/turbo-project-quote.service';
import { TurboProjectReconcileService } from '@api/collections/turbo-projects/services/turbo-project-reconcile.service';
import { TurboProjectSchedulingService } from '@api/collections/turbo-projects/services/turbo-project-scheduling.service';
import { TurboProjectsService } from '@api/collections/turbo-projects/services/turbo-projects.service';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { VideosModule } from '@api/collections/videos/videos.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { RouterModule } from '@api/services/router/router.module';
import { TurboRunModule } from '@api/services/turbo-run/turbo-run.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [TurboProjectsController],
  exports: [TurboProjectReconcileService],
  imports: [
    TurboRunModule,
    BrandsCoreModule,
    ByokModule,
    CreditsModule,
    ImagesModule,
    LoggerModule,
    ModelsModule,
    PlatformSettingsModule,
    PostsCoreModule,
    RouterModule,
    VideoGenerationModule,
    VideosModule,
    WorkflowsCoreModule,
    WorkflowsModule,
  ],
  providers: [
    TurboProjectCreditsService,
    TurboProjectIdeaDispatchService,
    TurboProjectIdeaGenerationService,
    TurboProjectQuoteService,
    TurboProjectReconcileService,
    TurboProjectSchedulingService,
    TurboProjectsService,
  ],
})
export class TurboProjectsModule {}
