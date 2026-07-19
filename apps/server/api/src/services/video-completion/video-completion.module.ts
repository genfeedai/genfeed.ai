import { ClipProjectsCoreModule } from '@api/collections/clip-projects/clip-projects-core.module';
import { EditorProjectsModule } from '@api/collections/editor-projects/editor-projects.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { VideoCompletionService } from '@api/services/video-completion/video-completion.service';
import { RedisModule } from '@libs/redis/redis.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [VideoCompletionService],
  imports: [
    RedisModule,
    ClipProjectsCoreModule,
    forwardRef(() => EditorProjectsModule),
    forwardRef(() => FileQueueModule),
    forwardRef(() => IngredientsModule),
    forwardRef(() => MetadataModule),
    forwardRef(() => NotificationsPublisherModule),
  ],
  providers: [VideoCompletionService],
})
export class VideoCompletionModule {}
