import * as fs from 'node:fs';
import path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { QUEUE_NAMES } from '@files/queues/queue.constants';
import { S3Service } from '@files/services/s3/s3.service';
import { YoutubeService } from '@files/services/youtube/youtube.service';
import { YtDlpService } from '@files/services/ytdlp/ytdlp.service';
import {
  JobResult,
  YoutubeJobData as YoutubeUploadJobData,
} from '@files/shared/interfaces/job.interface';
import { RedisService } from '@libs/redis/redis.service';
import { HttpService } from '@nestjs/axios';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';

interface YoutubeJobData {
  youtubeUrl: string;
  transcriptId: string;
  userId: string;
  organizationId: string;
  youtubeId: string;
}

interface WhisperJobData {
  audioUrl: string;
  transcriptId: string;
  userId: string;
  organizationId: string;
}

interface YoutubeMetadata {
  id: string;
  title?: string;
  description?: string;
  duration?: number;
  viewCount?: number;
  likeCount?: number;
  publishedAt?: string;
  categoryId?: string;
  tags?: string[];
}

@Processor(QUEUE_NAMES.YOUTUBE_PROCESSING)
export class YoutubeProcessor extends WorkerHost {
  private readonly logger = new Logger(YoutubeProcessor.name);

  constructor(
    private readonly configService: ConfigService,
    @Inject(HttpService) private httpService: HttpService,
    private redisService: RedisService,
    @Inject(S3Service) private s3Service: S3Service,
    @Inject(YtDlpService) private ytdlpService: YtDlpService,
    @Inject(YoutubeService) private youtubeService: YoutubeService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing YouTube job ${job.id}: ${job.name}`);

    switch (job.name) {
      case 'youtube-download-audio':
        return await this.handleYoutubeDownload(job as Job<YoutubeJobData>);

      case 'whisper-transcribe':
        return await this.handleWhisperTranscription(
          job as Job<WhisperJobData>,
        );

      case 'upload-youtube-unlisted':
      case 'upload-youtube':
        // Both job types now use the same handler
        return await this.handleUpload(job as Job<YoutubeUploadJobData>);

      default:
        throw new Error(`Unknown YouTube job type: ${job.name}`);
    }
  }

  /**
   * Handle YouTube audio download
   */
  private async handleYoutubeDownload(
    job: Job<YoutubeJobData>,
  ): Promise<unknown> {
    const { youtubeUrl, transcriptId, userId, organizationId } = job.data;

    try {
      this.logger.log(`Downloading audio from YouTube: ${youtubeUrl}`);

      await job.updateProgress(10);

      const metadata = await this.fetchVideoMetadata(job.data.youtubeId);
      if (metadata) {
        const updatePayload = this.buildTranscriptMetadataUpdate(metadata);
        if (Object.keys(updatePayload).length > 0) {
          await this.updateTranscript(transcriptId, updatePayload);
        }
      }

      // Define output path
      const timestamp = Date.now();
      const outputDir = path.resolve('public', 'tmp', 'youtube', transcriptId);
      const outputPath = path.join(outputDir, `${timestamp}.mp3`);

      // Download audio with ytdlp (lowest quality)
      const audioPath = await this.ytdlpService.downloadAudioLowestQuality(
        youtubeUrl,
        outputPath,
      );

      await job.updateProgress(50);

      this.logger.log(`Audio downloaded to: ${audioPath}`);

      // Upload to S3
      const s3Key = `transcripts/${transcriptId}/${timestamp}.mp3`;
      const s3Result = await this.s3Service.uploadFile(s3Key, audioPath);
      const audioUrl = s3Result.Location;

      await job.updateProgress(70);

      this.logger.log(`Audio uploaded to S3: ${audioUrl}`);

      await this.updateTranscriptStatus(transcriptId, 'transcribing', {
        audioFileUrl: audioUrl,
      });

      await job.updateProgress(80);

      // Queue Whisper transcription job
      await this.queueWhisperTranscription({
        audioUrl,
        organizationId,
        transcriptId,
        userId,
      });

      await job.updateProgress(100);

      // Clean up local file
      if (fs.existsSync(audioPath)) {
        fs.unlinkSync(audioPath);
      }

      // Clean up directory if empty
      if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length === 0) {
        fs.rmdirSync(outputDir);
      }

      return {
        audioUrl,
        success: true,
        transcriptId,
      };
    } catch (error: unknown) {
      this.logger.error(`YouTube download failed for ${transcriptId}`, error);

      await this.updateTranscriptStatus(transcriptId, 'failed', {
        error: (error as Error)?.message,
      });

      throw error;
    }
  }

  /**
   * Handle Whisper transcription
   */
  private async handleWhisperTranscription(
    job: Job<WhisperJobData>,
  ): Promise<unknown> {
    const { audioUrl, transcriptId, userId, organizationId } = job.data;

    try {
      this.logger.log(`Transcribing audio for transcript: ${transcriptId}`);

      await job.updateProgress(10);

      // Save audio to temp location for Whisper API
      const tempDir = path.resolve('public', 'tmp', 'whisper');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempAudioPath = path.join(tempDir, `${transcriptId}.mp3`);

      // Download audio from S3 to temp location
      await this.s3Service.downloadFromUrl(audioUrl, tempAudioPath);

      await job.updateProgress(40);

      const transcriptText = await this.callWhisperAPI(tempAudioPath);

      await job.updateProgress(70);

      this.logger.log(
        `Transcription completed: ${transcriptText.length} chars`,
      );

      await this.updateTranscriptText(transcriptId, transcriptText);

      await job.updateProgress(90);

      // Queue article generation
      await this.queueArticleGeneration({
        organizationId,
        transcriptId,
        userId,
      });

      await job.updateProgress(100);

      // Clean up temp file
      if (fs.existsSync(tempAudioPath)) {
        fs.unlinkSync(tempAudioPath);
      }

      return {
        success: true,
        transcriptId,
        transcriptText,
      };
    } catch (error: unknown) {
      this.logger.error(
        `Whisper transcription failed for ${transcriptId}`,
        error,
      );

      await this.updateTranscriptStatus(transcriptId, 'failed', {
        error: (error as Error)?.message,
      });

      throw error;
    }
  }

  /**
   * Call Whisper API for transcription
   */
  private async callWhisperAPI(audioPath: string): Promise<string> {
    // Internal service communication - use localhost
    const apiUrl = 'http://localhost:3010/speech/transcribe/audio';

    try {
      // Read the audio file
      const audioBuffer = fs.readFileSync(audioPath);

      const formData = new FormData();
      formData.append('audio', audioBuffer, {
        contentType: 'audio/mp3',
        filename: 'audio.mp3',
      });

      const response = await firstValueFrom(
        this.httpService.post(apiUrl, formData, {
          headers: formData.getHeaders(),
        }),
      );

      return response.data.text || response.data;
    } catch (error: unknown) {
      this.logger.error('Whisper API call failed', error);
      throw new Error(
        `Whisper transcription failed: ${(error as Error)?.message}`,
      );
    }
  }

  /**
   * Update transcript status
   */
  private async updateTranscriptStatus(
    transcriptId: string,
    status: string,
    additionalData: unknown = {},
  ): Promise<void> {
    // Internal service communication - use localhost
    const apiUrl = `http://localhost:3010/transcripts/${transcriptId}`;

    try {
      await firstValueFrom(
        this.httpService.patch(apiUrl, {
          status,
          ...additionalData,
        }),
      );
    } catch (error: unknown) {
      this.logger.error('Failed to update transcript status', error);
    }
  }

  private async updateTranscript(
    transcriptId: string,
    update: Record<string, unknown>,
  ): Promise<void> {
    const apiUrl = `http://localhost:3010/transcripts/${transcriptId}`;

    try {
      await firstValueFrom(this.httpService.patch(apiUrl, update));
    } catch (error: unknown) {
      this.logger.error('Failed to update transcript metadata', error);
    }
  }

  /**
   * Update transcript with transcription text
   */
  private async updateTranscriptText(
    transcriptId: string,
    transcriptText: string,
  ): Promise<void> {
    // Internal service communication - use localhost
    const apiUrl = `http://localhost:3010/transcripts/${transcriptId}`;

    try {
      await firstValueFrom(
        this.httpService.patch(apiUrl, {
          status: 'generating_article',
          transcriptText,
        }),
      );
    } catch (error: unknown) {
      this.logger.error('Failed to update transcript text', error);
    }
  }

  /**
   * Queue Whisper transcription job
   */
  private async queueWhisperTranscription(data: WhisperJobData): Promise<void> {
    await this.redisService.publish('queue:whisper-transcribe', data);
  }

  /**
   * Queue article generation
   */
  private async queueArticleGeneration(data: {
    transcriptId: string;
    userId: string;
    organizationId: string;
  }): Promise<void> {
    await this.redisService.publish(
      'queue:generate-article-from-transcript',
      data,
    );
  }

  private async fetchVideoMetadata(
    youtubeId: string,
  ): Promise<YoutubeMetadata | null> {
    const apiUrl = `http://localhost:3010/services/youtube/metadata/${youtubeId}`;

    try {
      const apiKey = this.configService.get('GENFEEDAI_API_KEY');

      // Prepare headers with authentication if API key is available
      const headers: Record<string, string> = {};
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await firstValueFrom(
        this.httpService.get(apiUrl, { headers }),
      );
      const metadata = response.data?.data as YoutubeMetadata | undefined;

      if (!metadata) {
        return null;
      }

      return {
        ...metadata,
        publishedAt: metadata.publishedAt
          ? new Date(metadata.publishedAt).toISOString()
          : undefined,
      };
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to fetch metadata for video ${youtubeId}: ${
          (error as Error)?.message || error
        }`,
      );
      return null;
    }
  }

  private buildTranscriptMetadataUpdate(
    metadata: YoutubeMetadata,
  ): Record<string, unknown> {
    const updatePayload: Record<string, unknown> = {};
    const videoMetadata: Record<string, unknown> = {};

    if (metadata.title) {
      updatePayload.videoTitle = metadata.title;
    }

    if (
      typeof metadata.duration === 'number' &&
      !Number.isNaN(metadata.duration)
    ) {
      updatePayload.videoDuration = metadata.duration;
      videoMetadata.duration = metadata.duration;
    }

    if (
      typeof metadata.viewCount === 'number' &&
      !Number.isNaN(metadata.viewCount)
    ) {
      videoMetadata.viewCount = metadata.viewCount;
    }

    if (
      typeof metadata.likeCount === 'number' &&
      !Number.isNaN(metadata.likeCount)
    ) {
      videoMetadata.likeCount = metadata.likeCount;
    }

    if (metadata.description) {
      videoMetadata.description = metadata.description;
    }

    if (metadata.publishedAt) {
      videoMetadata.publishedAt = metadata.publishedAt;
    }

    if (metadata.categoryId) {
      videoMetadata.categoryId = metadata.categoryId;
    }

    if (metadata.tags?.length) {
      videoMetadata.tags = metadata.tags;
    }

    if (Object.keys(videoMetadata).length > 0) {
      updatePayload.videoMetadata = videoMetadata;
    }

    return updatePayload;
  }

  /**
   * Handle YouTube upload (all types: unlisted, public, private, scheduled)
   */
  private async handleUpload(
    job: Job<YoutubeUploadJobData>,
  ): Promise<JobResult> {
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

      const completionStatus = this.mapUploadStatusToCompletionStatus(status);
      await this.publishYoutubeCompletion(
        postId,
        userId,
        organizationId,
        completionStatus,
        { externalId, videoUrl },
      );

      return {
        metadata: {
          externalId,
          videoUrl,
        },
        success: true,
      };
    } catch (error: unknown) {
      this.logger.error(
        `YouTube upload failed for post ${postId}: ${(error as Error)?.message}`,
        error,
      );

      // Publish failure event to Redis
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
    switch (status) {
      case 'public':
        return 'public';
      case 'private':
        return 'private';
      case 'scheduled':
        return 'scheduled';
      default:
        return 'unlisted';
    }
  }

  /**
   * Publish YouTube upload completion event to Redis
   */
  private async publishYoutubeCompletion(
    postId: string,
    userId: string,
    organizationId: string,
    status: 'unlisted' | 'public' | 'private' | 'scheduled' | 'failed',
    result: { externalId: string; videoUrl: string } | null,
    error?: string,
  ): Promise<void> {
    const event = {
      error,
      organizationId,
      postId,
      result,
      status,
      timestamp: new Date().toISOString(),
      userId,
    };

    try {
      await this.redisService.publish('youtube:upload:complete', event);
      this.logger.log(
        `Published YouTube completion event for post ${postId} with status ${status}`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to publish YouTube completion event: ${(error as Error)?.message}`,
        error,
      );
    }
  }
}
