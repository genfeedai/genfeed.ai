import {
  VideoRetentionService,
  type VideoRetentionTotals,
} from '@api/services/video-retention/video-retention.service';
import { Injectable } from '@nestjs/common';

/** Platform schedule handler: deletes expired, never-posted video files. */
@Injectable()
export class CronVideoRetentionService {
  constructor(private readonly retention: VideoRetentionService) {}

  expireUnpostedVideos(now = new Date()): Promise<VideoRetentionTotals> {
    return this.retention.sweep(now);
  }
}
