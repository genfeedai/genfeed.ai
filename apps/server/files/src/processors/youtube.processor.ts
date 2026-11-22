import { isFinalAttempt } from '@files/processors/video-processor.util';
import { YoutubeService } from '@files/services/youtube/youtube.service';
import {
  JobResult,
  YoutubeJobData,
} from '@files/shared/interfaces/job.interface';
import { FILE_QUEUE_NAMES as QUEUE_NAMES } from '@genfeedai/contracts/queue';
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
    const { postId, userId, organizationId, status } = job.data;

    this.logger.log(
      `Processing YouTube upload job ${job.id} for post ${postId}`,
    );

    try {
      await job.updateProgress(10);
      const externalId =
        job.data.externalId ?? (await this.uploadAndRecord(job));
      const videoUrl = `https://www.youtube.com/watch?v=${externalId}`;
      try {
        await job.updateProgress(100);
      } catch (progressError: unknown) {
        this.logger.warn(
          `Progress update failed after upload for post ${postId}: ${(progressError as Error)?.message}`,
        );
      }
      await this.emitYoutubeCompletion(
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
      // Once the video is on YouTube a retry only redoes the follow-up, so
      // the post is never reported as failed.
      if (isFinalAttempt(job) && !job.data.externalId) {
        await this.publishYoutubeCompletion(
          postId,
          userId,
          organizationId,
          'failed',
          null,
          (error as Error)?.message,
        );
      }
      throw error;
    }
  }

  /**
   * Upload the video, then store the external id on the job at once so a retry
   * of this job never uploads a second copy.
   */
  private async uploadAndRecord(job: Job<YoutubeJobData>): Promise<string> {
    const { credential, ingredientId, title, description, tags, status } =
      job.data;
    if (!credential) {
      throw new Error('Credential data missing from job');
    }

    const externalId = await this.youtubeService.uploadVideo({
      credential,
      description: description || '',
      ingredientId,
      ...(job.data.sourceStorageKey
        ? { sourceStorageKey: job.data.sourceStorageKey }
        : {}),
      scheduledDate: job.data.scheduledDate
        ? new Date(job.data.scheduledDate)
        : undefined,
      status: status || 'private',
      tags: tags || [],
      title: title || 'Untitled',
    });
    try {
      await job.updateData({ ...job.data, externalId });
    } catch (persistError: unknown) {
      this.logger.error(
        `Failed to record YouTube video ${externalId} on job ${job.id}: ${(persistError as Error)?.message}`,
        persistError,
      );
    }
    return externalId;
  }

  private mapUploadStatusToCompletionStatus(
    status: string | undefined,
  ): 'unlisted' | 'public' | 'private' | 'scheduled' | 'failed' {
    return status === 'public' || status === 'private' || status === 'scheduled'
      ? status
      : 'unlisted';
  }

  /** Publish the completion event; a failure fails the job so a retry sends it. */
  private async emitYoutubeCompletion(
    postId: string,
    userId: string,
    organizationId: string,
    status: 'unlisted' | 'public' | 'private' | 'scheduled' | 'failed',
    result: { externalId: string; videoUrl: string } | null,
    error?: string,
  ): Promise<void> {
    await this.redisService.publish('youtube:upload:complete', {
      error,
      organizationId,
      postId,
      result,
      status,
      timestamp: new Date().toISOString(),
      userId,
    });
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
      await this.emitYoutubeCompletion(
        postId,
        userId,
        organizationId,
        status,
        result,
        error,
      );
    } catch (publishError: unknown) {
      this.logger.error(
        `Failed to publish YouTube completion event: ${(publishError as Error)?.message}`,
        publishError,
      );
    }
  }
}
