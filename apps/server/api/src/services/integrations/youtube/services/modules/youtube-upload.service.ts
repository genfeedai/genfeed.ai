import fs from 'node:fs';
import path from 'node:path';
import type {
  ServerYoutubeUploader,
  YoutubeUploadPostInput,
} from '@api/server.dependencies';
import { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { TagResolutionService } from '@api/shared/services/tag-resolution/tag-resolution.service';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import {
  type ChannelTargetSettings,
  readChannelSettingBoolean,
  readChannelSettingString,
} from '@api-types/contracts/channel-capabilities.contract';
import { resolvePostVisibility } from '@api-types/contracts/scheduler.contract';
import { PostVisibility } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { google, type youtube_v3 } from 'googleapis';

@Injectable()
export class YoutubeUploadService implements ServerYoutubeUploader {
  private readonly constructorName = this.constructor.name;
  private readonly youtubeAPI: ReturnType<typeof google.youtube>;

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

  private resolveFilePath(videoId: string, outputPath: unknown): string {
    if (typeof outputPath === 'string' && outputPath.length > 0) {
      return outputPath;
    }

    return path.join(
      process.cwd(),
      'public',
      'tmp',
      'videos',
      videoId,
      'file-0.mp4',
    );
  }

  /**
   * @param credentialId - which connected YouTube channel this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  async uploadVideo(
    organizationId: string,
    brandId: string,
    videoId: string,
    post: YoutubeUploadPostInput,
    settings: ChannelTargetSettings = {},
    credentialId?: string,
  ): Promise<string> {
    const url = `${this.constructorName} uploadVideo ${videoId}`;

    try {
      this.loggerService.log(`${url} started`);

      const auth = await this.authService.refreshToken(
        organizationId,
        brandId,
        credentialId,
      );

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

      const filePath = this.resolveFilePath(videoId, result?.outputPath);

      const tagLabels = await this.tagResolutionService.resolveTagLabels(
        post.tags || [],
      );

      // Determine YouTube privacy status and handle scheduled uploads
      // If scheduledDate is in the future, upload as PRIVATE with publishAt
      // YouTube will automatically publish the video at the specified time
      const hasFutureScheduledDate =
        post.scheduledDate && new Date(post.scheduledDate) > new Date();

      const requestedPrivacy = resolvePostVisibility(post.visibility);
      const madeForKids = readChannelSettingBoolean(settings, 'madeForKids');
      // `selfDeclaredMadeForKids` is only accepted alongside the `status` part,
      // and YouTube rejects the field when it is absent rather than defaulting.
      const audienceConfig =
        madeForKids === undefined
          ? {}
          : { selfDeclaredMadeForKids: madeForKids };

      let privacyStatus: string;
      let statusConfig: youtube_v3.Schema$VideoStatus;

      if (hasFutureScheduledDate) {
        // Future scheduled date: upload as private with publishAt
        // YouTube will automatically make it public at the scheduled time.
        // `publishAt` always publishes publicly, so an explicit non-public
        // choice has to drop the timer rather than silently override it.
        const honoursTimer = requestedPrivacy === PostVisibility.PUBLIC;

        statusConfig = honoursTimer
          ? {
              ...audienceConfig,
              privacyStatus: PostVisibility.PRIVATE,
              publishAt: new Date(post.scheduledDate).toISOString(),
            }
          : { ...audienceConfig, privacyStatus: requestedPrivacy };

        this.loggerService.log(
          honoursTimer
            ? `Scheduling video for future publication: ${post.scheduledDate.toISOString()}`
            : `Uploading video as ${requestedPrivacy}; YouTube's publish timer only supports public releases`,
        );
      } else {
        privacyStatus = requestedPrivacy;
        statusConfig = { ...audienceConfig, privacyStatus };
      }

      // Sanitize HTML to plain text - YouTube doesn't support HTML markup
      const description = htmlToText(post.description);

      const playlistId = readChannelSettingString(settings, 'playlistId');

      const insertParams: youtube_v3.Params$Resource$Videos$Insert = {
        auth: auth as unknown as youtube_v3.Params$Resource$Videos$Insert['auth'],
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
      const res = await this.youtubeAPI.videos.insert(insertParams, {});

      if (!res.data?.id) {
        throw new Error('Failed to upload video');
      }

      const youtubeVideoId = res.data.id;

      if (playlistId) {
        await this.addToPlaylist(youtubeVideoId, playlistId, auth, url);
      }

      this.loggerService.log(`${url} completed`, { youtubeVideoId });

      fs.unlinkSync(filePath);

      return youtubeVideoId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Playlist insertion is a separate API call that runs after a successful
   * upload. It is deliberately non-fatal: the video is already live, so a
   * playlist failure must not report the publish itself as failed.
   */
  private async addToPlaylist(
    videoId: string,
    playlistId: string,
    auth: unknown,
    logPrefix: string,
  ): Promise<void> {
    try {
      await this.youtubeAPI.playlistItems.insert({
        auth,
        part: ['snippet'],
        requestBody: {
          snippet: {
            playlistId,
            resourceId: { kind: 'youtube#video', videoId },
          },
        },
      } as youtube_v3.Params$Resource$Playlistitems$Insert);
    } catch (error: unknown) {
      this.loggerService.error(`${logPrefix} failed to add video to playlist`, {
        error: (error as Error)?.message,
        playlistId,
        videoId,
      });
    }
  }
}
