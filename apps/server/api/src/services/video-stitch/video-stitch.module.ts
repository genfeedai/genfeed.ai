import { CaptionsModule } from '@api/collections/captions/captions.module';
import { ActivityRecordingModule } from '@api/services/activity-recording/activity-recording.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { NotificationsPublisherModule } from '@api/services/notifications/publisher/notifications-publisher.module';
import { VideoStitchService } from '@api/services/video-stitch/video-stitch.service';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { Module } from '@nestjs/common';

/**
 * Leaf module for the single video stitch path (#5460). Videos, webhooks,
 * workflows and content runs import it; it must never import any of them
 * (`WebhooksMediaModule` included) — `module-graph.spec.ts` lists it as a
 * leaf.
 */
@Module({
  exports: [VideoStitchService],
  imports: [
    ActivityRecordingModule,
    CaptionsModule,
    FileQueueModule,
    NotificationsPublisherModule,
    WhisperModule,
  ],
  providers: [VideoStitchService],
})
export class VideoStitchModule {}
