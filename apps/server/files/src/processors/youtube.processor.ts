import { YoutubeService } from '@files/services/youtube/youtube.service';
import {
  JobResult,
  YoutubeJobData,
} from '@files/shared/interfaces/job.interface';
import { FILE_QUEUE_NAMES as QUEUE_NAMES } from '@genfeedai/queue-contracts';
import { withLongJobWorkerOptions } from '@libs/jobs/bullmq-worker-lock.options';
import { RedisService } from '@libs/redis/redis.service';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

@Processor(QUEUE_NAMES.YOUTUBE_PROCESSING, withLongJobWorkerOptions({}))
export class YoutubeProcessor extends WorkerHost {
  private readonly logger = new Logger(YoutubeProcessor.name);

  constructor(
    private readonly redisService: RedisService,
    @Inject(YoutubeService) private readonly youtubeService: YoutubeService,
  ) {
    super();
  }

  async process(job: Job<YoutubeJobData>): Promise<JobResult> {
    if (!['upload-youtube', 'upload-youtube-unlisted'].includes(job.name)) {
      throw new Error(`Unknown YouTube job type: ${job.name}`);
    }
    return this.handleUpload(job);
  }

  private async handleUpload(job: Job<YoutubeJobData>): Promise<JobResult> {
    const {
      credential,
      postId,
      ingredientId,
      userId,
      organizationId,
      title,
      description,
      tags,
      status,
      scheduledDate,
    } = job.data;

    this.logger.log(
      `Processing YouTube upload job ${job.id} for post ${postId}`,
    );

    try {
      await job.updateProgress(10);
      if (!credential) {
        throw new Error('Credential data missing from job');
      }

      const externalId = await this.youtubeService.uploadVideo({
        credential,
        description: description || '',
        ingredientId,
        scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        status: status || 'private',
        tags: tags || [],
        title: title || 'Untitled',
      });
      const videoUrl = `https://www.youtube.com/watch?v=${externalId}`;
      await job.updateProgress(100);
      await this.publishYoutubeCompletion(
        postId,
        userId,
        organizationId,
        this.mapUploadStatusToCompletionStatus(status),
        { externalId, videoUrl },
      );
      return { metadata: { externalId, videoUrl }, success: true };
    } catch (error: unknown) {
      this.logger.error(
        `YouTube upload failed for post ${postId}: ${(error as Error)?.message}`,
        error,
      );
      await this.publishYoutubeCompletion(
        postId,
        userId,
        organizationId,
        'failed',
        null,
        (error as Error)?.message,
      );
      throw error;
    }
  }

  private mapUploadStatusToCompletionStatus(
    status: string | undefined,
  ): 'unlisted' | 'public' | 'private' | 'scheduled' | 'failed' {
    return status === 'public' || status === 'private' || status === 'scheduled'
      ? status
      : 'unlisted';
  }

  private async publishYoutubeCompletion(
    postId: string,
    userId: string,
    organizationId: string,
    status: 'unlisted' | 'public' | 'private' | 'scheduled' | 'failed',
    result: { externalId: string; videoUrl: string } | null,
    error?: string,
  ): Promise<void> {
    try {
      await this.redisService.publish('youtube:upload:complete', {
        error,
        organizationId,
        postId,
        result,
        status,
        timestamp: new Date().toISOString(),
        userId,
      });
    } catch (publishError: unknown) {
      this.logger.error(
        `Failed to publish YouTube completion event: ${(publishError as Error)?.message}`,
        publishError,
      );
    }
  }
}
