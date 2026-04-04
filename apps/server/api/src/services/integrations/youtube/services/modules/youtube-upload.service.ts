import fs from 'node:fs';
import path from 'node:path';
import { PostEntity } from '@api/collections/posts/entities/post.entity';
import { ConfigService } from '@api/config/config.service';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { TagResolutionService } from '@api/shared/services/tag-resolution/tag-resolution.service';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import { PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { google } from 'googleapis';

@Injectable()
export class YoutubeUploadService {
  private readonly constructorName = this.constructor.name;
  private readonly youtubeAPI: unknown;

  constructor(
    private readonly fileQueueService: FileQueueService,
    private readonly tagResolutionService: TagResolutionService,
    private readonly authService: YoutubeAuthService,
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
  ) {
    // Create YouTube API client without default auth
    // Each upload will pass its own per-request auth
    this.youtubeAPI = google.youtube({ version: 'v3' });
  }

  async uploadVideo(
    organizationId: string,
    brandId: string,
    videoId: string,
    post: PostEntity,
  ): Promise<string> {
    const url = `${this.constructorName} uploadVideo ${videoId}`;

    try {
      this.loggerService.log(`${url} started`);

      const auth = await this.authService.refreshToken(organizationId, brandId);

      const downloadJob = await this.fileQueueService.processFile({
        ingredientId: videoId,
        organizationId: organizationId || 'system',
        params: {
          type: 'videos',
          url: `${this.configService.ingredientsEndpoint}/videos/${videoId}`,
        },
        type: 'download-file',
        userId: 'system',
      });

      const result = await this.fileQueueService.waitForJob(
        downloadJob.jobId,
        30_000,
      );

      const filePath =
        result?.outputPath ||
        path.join(
          process.cwd(),
          'public',
          'tmp',
          'videos',
          videoId,
          'file-0.mp4',
        );

      const tagLabels = await this.tagResolutionService.resolveTagLabels(
        post.tags || [],
      );

      // Determine YouTube privacy status and handle scheduled uploads
      // If scheduledDate is in the future, upload as PRIVATE with publishAt
      // YouTube will automatically publish the video at the specified time
      const hasFutureScheduledDate =
        post.scheduledDate && new Date(post.scheduledDate) > new Date();

      let privacyStatus: string;
      let statusConfig: unknown;

      if (hasFutureScheduledDate) {
        // Future scheduled date: upload as private with publishAt
        // YouTube will automatically make it public at the scheduled time
        statusConfig = {
          privacyStatus: PostStatus.PRIVATE,
          publishAt: new Date(post.scheduledDate).toISOString(),
        };
        this.loggerService.log(
          `Scheduling video for future publication: ${post.scheduledDate.toISOString()}`,
        );
      } else {
        // No future date or date has passed: use the post status
        if (post.status === PostStatus.PUBLIC) {
          privacyStatus = PostStatus.PUBLIC;
        } else if (post.status === PostStatus.PRIVATE) {
          privacyStatus = PostStatus.PRIVATE;
        } else if (post.status === PostStatus.UNLISTED) {
          privacyStatus = PostStatus.UNLISTED;
        } else if (post.status === PostStatus.SCHEDULED) {
          // SCHEDULED but no future date means cron picked it up (date passed)
          privacyStatus = PostStatus.PUBLIC;
        } else if (post.status === PostStatus.PROCESSING) {
          // PROCESSING means we're in the middle of an upload
          // This shouldn't happen, but default to PUBLIC for safety
          privacyStatus = PostStatus.PUBLIC;
        } else {
          // Invalid status, default to PRIVATE for safety
          privacyStatus = PostStatus.PRIVATE;
        }
        statusConfig = { privacyStatus };
      }

      // Sanitize HTML to plain text - YouTube doesn't support HTML markup
      const description = htmlToText(post.description);

      const body = {
        media: {
          body: fs.createReadStream(filePath),
        },
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            description,
            tags: tagLabels,
            title: post.label || 'Genfeed.ai Video',
          },
          status: statusConfig,
        },
      };

      const res = await this.youtubeAPI.videos.insert({
        ...body,
        auth,
      });

      if (!res.data.id) {
        throw new Error('Failed to upload video');
      }

      const youtubeVideoId: string = res.data.id;

      this.loggerService.log(`${url} completed`, { youtubeVideoId });

      fs.unlinkSync(filePath);

      return youtubeVideoId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
