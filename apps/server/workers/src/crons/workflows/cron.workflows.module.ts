import {
  Article,
  ArticleSchema,
} from '@api/collections/articles/schemas/article.schema';
import {
  Image,
  ImageSchema,
} from '@api/collections/images/schemas/image.schema';
import {
  Music,
  MusicSchema,
} from '@api/collections/musics/schemas/music.schema';
import {
  Video,
  VideoSchema,
} from '@api/collections/videos/schemas/video.schema';
import {
  Workflow,
  WorkflowSchema,
} from '@api/collections/workflows/schemas/workflow.schema';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { ByokModule } from '@api/services/byok/byok.module';
import { ElevenLabsModule } from '@api/services/integrations/elevenlabs/elevenlabs.module';
import { FalModule } from '@api/services/integrations/fal/fal.module';
import { FleetModule } from '@api/services/integrations/fleet/fleet.module';
import { HedraModule } from '@api/services/integrations/hedra/hedra.module';
import { HiggsFieldModule } from '@api/services/integrations/higgsfield/higgsfield.module';
import { KlingAIModule } from '@api/services/integrations/klingai/klingai.module';
import { LeonardoAIModule } from '@api/services/integrations/leonardoai/leonardoai.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CronWorkflowsService } from '@workers/crons/workflows/cron.workflows.service';
import { GenerateArticleTask } from '@workers/crons/workflows/task-types/generate-article.task';
import { GenerateImageTask } from '@workers/crons/workflows/task-types/generate-image.task';
import { GenerateMusicTask } from '@workers/crons/workflows/task-types/generate-music.task';
import { GenerateVideoTask } from '@workers/crons/workflows/task-types/generate-video.task';

@Module({
  exports: [CronWorkflowsService],
  imports: [
    ByokModule,
    ElevenLabsModule,
    FalModule,
    FleetModule,
    HedraModule,
    HiggsFieldModule,
    HttpModule,
    KlingAIModule,
    LeonardoAIModule,
    NotificationsModule,
    ReplicateModule,
    WorkflowsModule,
    MongooseModule.forFeature(
      [
        { name: Workflow.name, schema: WorkflowSchema },
        { name: Image.name, schema: ImageSchema },
        { name: Video.name, schema: VideoSchema },
        { name: Music.name, schema: MusicSchema },
        { name: Article.name, schema: ArticleSchema },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
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
