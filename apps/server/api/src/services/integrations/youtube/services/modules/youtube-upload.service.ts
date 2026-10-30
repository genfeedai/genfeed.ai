import { Readable } from 'node:stream';
import { BrandCoverStyleService } from '@api/collections/brands/services/brand-cover-style.service';
import type {
  ServerYoutubeUploader,
  YoutubeUploadPostInput,
} from '@api/server.dependencies';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
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

/** Second of the video the thumbnail still is taken from. */
const THUMBNAIL_FRAME_SECONDS = 1;
/** 1080 wide gives a 1080x1920 still for a 9:16 Short (YouTube minimum is 640px). */
const THUMBNAIL_WIDTH = 1080;

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
    @Optional()
    private readonly filesClient?: FilesClientService,
    @Optional()
    private readonly brandCoverStyle?: BrandCoverStyleService,
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

      const statusConfig = this.buildStatusConfig(post, settings);

      // Sanitize HTML to plain text - YouTube doesn't support HTML markup
      const description = htmlToText(post.description);

      const playlistId = readChannelSettingString(settings, 'playlistId');

      const uploadSignal = AbortSignal.timeout(10 * 60_000);

      // Grab the frame while the video uploads: the source URL can expire
      // during a long upload, and the frame is ready by the time it finishes.
      const thumbnailPromise = this.prepareThumbnail(
        videoId,
        sourceUrl,
        uploadSignal,
        url,
        settings,
        organizationId,
        brandId,
      );
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

      await this.setThumbnail(
        youtubeVideoId,
        await thumbnailPromise,
        auth,
        url,
      );

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
   * If scheduledDate is in the future, upload as PRIVATE with publishAt and
   * YouTube publishes the video at that time.
   */
  private buildStatusConfig(
    post: YoutubeUploadPostInput,
    settings: ChannelTargetSettings,
  ): youtube_v3.Schema$VideoStatus {
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
      madeForKids === undefined ? {} : { selfDeclaredMadeForKids: madeForKids };

    if (!hasFutureScheduledDate) {
      return { ...audienceConfig, privacyStatus: requestedPrivacy };
    }

    // `publishAt` always publishes publicly, so an explicit non-public
    // choice has to drop the timer rather than silently override it.
    const honoursTimer = requestedPrivacy === PostVisibility.PUBLIC;

    this.loggerService.log(
      honoursTimer
        ? `Scheduling video for future publication: ${post.scheduledDate.toISOString()}`
        : `Uploading video as ${requestedPrivacy}; YouTube's publish timer only supports public releases`,
    );

    return honoursTimer
      ? {
          ...audienceConfig,
          privacyStatus: PostVisibility.PRIVATE,
          publishAt: new Date(post.scheduledDate).toISOString(),
        }
      : { ...audienceConfig, privacyStatus: requestedPrivacy };
  }

  /**
   * Renders the cover through the files service: a still from the source video,
   * with the post's cover title laid over it when one is set. Never rejects:
   * the thumbnail is an enhancement and must not fail the upload.
   */
  private async prepareThumbnail(
    ingredientId: string,
    sourceUrl: string,
    signal: AbortSignal,
    logPrefix: string,
    settings: ChannelTargetSettings,
    organizationId: string,
    brandId: string,
  ): Promise<Buffer | undefined> {
    if (!this.filesClient) return undefined;

    const frameSeconds = Number(
      readChannelSettingString(settings, 'thumbnailFrameSeconds'),
    );

    try {
      const coverStyle = await this.brandCoverStyle?.resolveCoverStyle(
        brandId,
        organizationId,
      );
      const frame = await this.filesClient.generateThumbnail(
        sourceUrl,
        ingredientId,
        Number.isFinite(frameSeconds) && frameSeconds >= 0
          ? frameSeconds
          : THUMBNAIL_FRAME_SECONDS,
        THUMBNAIL_WIDTH,
        readChannelSettingString(settings, 'thumbnailText')?.trim(),
        true,
        coverStyle,
      );
      if (!frame?.thumbnailUrl) return undefined;

      const response = await firstValueFrom(
        this.httpService.get<ArrayBuffer>(frame.thumbnailUrl, {
          responseType: 'arraybuffer',
          signal,
          timeout: 30_000,
        }),
      );
      return Buffer.from(response.data);
    } catch (error: unknown) {
      this.loggerService.warn(`${logPrefix} thumbnail generation failed`, {
        error: getErrorMessage(error),
      });
      return undefined;
    }
  }

  /**
   * `thumbnails.set` is a separate API call (~50 quota units) that runs after
   * a successful upload. Non-fatal for the same reason as the playlist call:
   * the video is already on YouTube. YouTube Help documents custom Shorts
   * thumbnails as a Studio-on-desktop feature, and the Data API reference does
   * not say whether it accepts them, so a rejection here is logged, not thrown.
   */
  private async setThumbnail(
    youtubeVideoId: string,
    thumbnail: Buffer | undefined,
    auth: unknown,
    logPrefix: string,
  ): Promise<void> {
    if (!thumbnail) return;

    try {
      await this.youtubeAPI.thumbnails.set({
        auth,
        media: { body: Readable.from(thumbnail), mimeType: 'image/jpeg' },
        videoId: youtubeVideoId,
      } as youtube_v3.Params$Resource$Thumbnails$Set);
      this.loggerService.log(`${logPrefix} custom thumbnail set`, {
        youtubeVideoId,
      });
    } catch (error: unknown) {
      this.loggerService.warn(`${logPrefix} failed to set custom thumbnail`, {
        error: getErrorMessage(error),
        youtubeVideoId,
      });
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
