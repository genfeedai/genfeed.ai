import type { Readable } from 'node:stream';
import type {
  ServerYoutubeUploader,
  YoutubeUploadPostInput,
} from '@api/server.dependencies';
import { YoutubeAuthService } from '@api/services/integrations/youtube/services/modules/youtube-auth.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { requireStoredMediaKey } from '@api/services/media-urls/media-delivery-policy.util';
import { TagResolutionService } from '@api/shared/services/tag-resolution/tag-resolution.service';
import { htmlToText } from '@api/shared/utils/html-to-text/html-to-text.util';
import { PostVisibility } from '@genfeedai/contracts';
import {
  type ChannelTargetSettings,
  readChannelSettingBoolean,
  readChannelSettingString,
} from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { resolveYouTubeUploadVisibility } from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { HttpService } from '@nestjs/axios';
import { Injectable, Optional } from '@nestjs/common';
import { google, type youtube_v3 } from 'googleapis';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class YoutubeUploadService implements ServerYoutubeUploader {
  private readonly constructorName = this.constructor.name;
  private readonly youtubeAPI: ReturnType<typeof google.youtube>;

  constructor(
    private readonly httpService: HttpService,
    private readonly tagResolutionService: TagResolutionService,
    private readonly authService: YoutubeAuthService,
    private readonly loggerService: LoggerService,
    private readonly configService: ConfigService,
    @Optional()
    private readonly authorizedMediaUrls?: AuthorizedMediaUrlService,
  ) {
    // Create YouTube API client without default auth
    // Each upload will pass its own per-request auth
    this.youtubeAPI = google.youtube({ version: 'v3' });
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

    let mediaStream: Readable | undefined;
    try {
      this.loggerService.log(`${url} started`);

      const auth = await this.authService.refreshToken(
        organizationId,
        brandId,
        credentialId,
      );

      let sourceUrl = `${this.configService.ingredientsEndpoint}/videos/${videoId}`;
      if (this.configService.isAuthorizedMediaDeliveryEnabled) {
        if (!this.authorizedMediaUrls)
          throw new Error('Authorized media issuer is unavailable');
        const [source] = await this.authorizedMediaUrls.readSources(
          organizationId,
          [videoId],
        );
        if (
          !source ||
          !['VIDEO', 'VIDEO_EDIT', 'AVATAR'].includes(source.category)
        )
          throw new Error('YouTube source video is unavailable');
        requireStoredMediaKey(source);
        const sources = await this.authorizedMediaUrls.issueServerPublish(
          organizationId,
          [videoId],
        );
        const authorizedUrl = sources.get(videoId);
        if (!authorizedUrl)
          throw new Error('YouTube source video is unavailable');
        sourceUrl = authorizedUrl;
      }

      const tagLabels = await this.tagResolutionService.resolveTagLabels(
        post.tags || [],
      );

      // Determine YouTube privacy status and handle scheduled uploads
      // If scheduledDate is in the future, upload as PRIVATE with publishAt
      // YouTube will automatically publish the video at the specified time
      const hasFutureScheduledDate =
        post.scheduledDate && new Date(post.scheduledDate) > new Date();

      const requestedPrivacy = resolveYouTubeUploadVisibility(
        post.visibility,
        readChannelSettingString(settings, 'privacyStatus'),
      );
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

      const uploadSignal = AbortSignal.timeout(10 * 60_000);
      const mediaResponse = await firstValueFrom(
        this.httpService.get<Readable>(sourceUrl, {
          responseType: 'stream',
          signal: uploadSignal,
          timeout: 30_000,
        }),
      );
      mediaStream = mediaResponse.data;

      const insertParams: youtube_v3.Params$Resource$Videos$Insert = {
        auth: auth as unknown as youtube_v3.Params$Resource$Videos$Insert['auth'],
        media: {
          body: mediaStream,
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
      const res = await this.youtubeAPI.videos.insert(insertParams, {
        signal: uploadSignal,
      });

      if (!res.data?.id) {
        throw new Error('Failed to upload video');
      }

      const youtubeVideoId = res.data.id;

      if (playlistId) {
        await this.addToPlaylist(youtubeVideoId, playlistId, auth, url);
      }

      this.loggerService.log(`${url} completed`, { youtubeVideoId });

      return youtubeVideoId;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        error: getErrorMessage(error),
      });
      throw error;
    } finally {
      mediaStream?.destroy();
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
