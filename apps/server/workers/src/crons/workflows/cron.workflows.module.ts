import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CacheModule } from '@server/services/cache/cache.module';
import { CronWorkflowsService } from '@workers/crons/workflows/cron.workflows.service';
import { GenerateArticleTask } from '@workers/crons/workflows/task-types/generate-article.task';
import { GenerateImageTask } from '@workers/crons/workflows/task-types/generate-image.task';
import { GenerateMusicTask } from '@workers/crons/workflows/task-types/generate-music.task';
import { GenerateVideoTask } from '@workers/crons/workflows/task-types/generate-video.task';
import { GenerationServicesModule } from '@workers/services/generation-services.module';
import { WorkersDomainModule } from '@server/workers-domain.module';

@Module({
  exports: [CronWorkflowsService],
  imports: [
    WorkersDomainModule,
    CacheModule,
    GenerationServicesModule,
    HttpModule,
  ],
  providers: [
    CronWorkflowsService,
    GenerateArticleTask,
    GenerateImageTask,
    GenerateMusicTask,
    GenerateVideoTask,
  ],
})
export class CronWorkflowsModule {}
