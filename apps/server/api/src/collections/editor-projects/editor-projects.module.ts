import { EditorProjectsController } from '@api/collections/editor-projects/editor-projects.controller';
import { EditorProjectsService } from '@api/collections/editor-projects/editor-projects.service';
import { EditorRenderService } from '@api/collections/editor-projects/services/editor-render.service';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { SharedModule } from '@api/shared/shared.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [EditorProjectsController],
  exports: [EditorProjectsService],
  imports: [
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => FileQueueModule),
    forwardRef(() => FilesClientModule),
    forwardRef(() => NotificationsPublisherModule),
    forwardRef(() => SharedModule),
  ],
  providers: [EditorProjectsService, EditorRenderService],
})
export class EditorProjectsModule {}
