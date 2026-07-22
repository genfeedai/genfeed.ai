import { ConfigModule } from '@files/config/config.module';
import { QUEUE_NAMES } from '@files/queues/queue.constants';
import { ClipReferenceFramesModule } from '@files/services/clip-reference-frames/clip-reference-frames.module';
import { FFmpegModule } from '@files/services/ffmpeg/ffmpeg.module';
import { FilesModule } from '@files/services/files/files.module';
import { HookRemixModule } from '@files/services/hook-remix/hook-remix.module';
import { JobLifecyclePublisherService } from '@files/services/job-lifecycle-publisher.service';
import { RemotionRenderCancellationService } from '@files/services/remotion/remotion-render-cancellation.service';
import { RemotionRenderJobService } from '@files/services/remotion/remotion-render-job.service';
import { RemotionRendererService } from '@files/services/remotion/remotion-renderer.service';
import { S3Service } from '@files/services/s3/s3.service';
import { ThumbnailsModule } from '@files/services/thumbnails/thumbnails.module';
import { UploadModule } from '@files/services/upload/upload.module';
import { VideoMergeJobService } from '@files/services/video-merge/video-merge-job.service';
import { WebSocketService } from '@files/services/websocket/websocket.service';
import { YtDlpModule } from '@files/services/ytdlp/ytdlp.module';
import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    ClipReferenceFramesModule,
    FFmpegModule,
    FilesModule,
    HookRemixModule,
    JobLifecyclePublisherService,
    RemotionRenderCancellationService,
    RemotionRenderJobService,
    RemotionRendererService,
    S3Service,
    ThumbnailsModule,
    UploadModule,
    VideoMergeJobService,
    WebSocketService,
    YtDlpModule,
  ],
  imports: [
    ClipReferenceFramesModule,
    ConfigModule,
    FFmpegModule,
    FilesModule,
    HookRemixModule,
    ThumbnailsModule,
    UploadModule,
    YtDlpModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.TASK_PROCESSING },
      { name: QUEUE_NAMES.VIDEO_PROCESSING },
      { name: QUEUE_NAMES.IMAGE_PROCESSING },
      { name: QUEUE_NAMES.FILE_PROCESSING },
    ),
  ],
  providers: [
    S3Service,
    VideoMergeJobService,
    WebSocketService,
    JobLifecyclePublisherService,
    RemotionRenderCancellationService,
    RemotionRenderJobService,
    RemotionRendererService,
  ],
})
export class ServicesModule {}
