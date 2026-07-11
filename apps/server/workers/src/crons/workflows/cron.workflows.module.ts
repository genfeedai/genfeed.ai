import { CreditsModule } from '@api/collections/credits/credits.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { ManagedInferenceModule } from '@api/endpoints/v1/managed-inference/managed-inference.module';
import { ByokModule } from '@api/services/byok/byok.module';
import { FleetModule } from '@api/services/integrations/fleet/fleet.module';
import { HedraModule } from '@api/services/integrations/hedra/hedra.module';
import { HiggsFieldModule } from '@api/services/integrations/higgsfield/higgsfield.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { CronWorkflowsService } from '@workers/crons/workflows/cron.workflows.service';
import { GenerateArticleTask } from '@workers/crons/workflows/task-types/generate-article.task';
import { GenerateImageTask } from '@workers/crons/workflows/task-types/generate-image.task';
import { GenerateMusicTask } from '@workers/crons/workflows/task-types/generate-music.task';
import { GenerateVideoTask } from '@workers/crons/workflows/task-types/generate-video.task';
import { GenerationServicesModule } from '@workers/services/generation-services.module';

@Module({
  exports: [CronWorkflowsService],
  imports: [
    ByokModule,
    CreditsModule,
    FleetModule,
    GenerationServicesModule,
    HedraModule,
    HiggsFieldModule,
    HttpModule,
    ManagedInferenceModule,
    NotificationsModule,
    WorkflowsModule,
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
