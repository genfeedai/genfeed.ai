import { EditorProjectsController } from '@api/collections/editor-projects/editor-projects.controller';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { RemotionCompositionsController } from '@api/collections/editor-projects/remotion-compositions.controller';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { RemotionCompositionsService } from '@api/collections/editor-projects/services/remotion-compositions.service';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { SharedModule } from '@api/shared/shared.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [EditorProjectsController, RemotionCompositionsController],
  exports: [EditorProjectsService],
  imports: [
    WorkflowsCoreModule,
    IngredientsModule,
    MetadataModule,
    FileQueueModule,
    FilesClientModule,
    NotificationsPublisherModule,
    SharedModule,
  ],
  providers: [
    EditorProjectsService,
    EditorRenderService,
    RemotionCompositionsService,
  ],
})
export class EditorProjectsModule {}
