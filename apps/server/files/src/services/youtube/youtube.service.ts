import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { S3Service } from '@files/services/s3/s3.service';
import type { YoutubeCredential } from '@files/shared/interfaces/job.interface';
import { PostStatus } from '@genfeedai/contracts';
import { youtube, type youtube_v3 } from '@googleapis/youtube';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import axios from 'axios';
import { type Credentials, OAuth2Client } from 'google-auth-library';

@Injectable()
export class YoutubeService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    @Optional() private readonly s3Service?: S3Service,
  ) {}

  /**
   * Create a YouTube API client for one upload. The client is never stored on
   * the instance, so concurrent uploads for different accounts cannot share it.
   */
  private createYoutubeAPI(credential: YoutubeCredential): youtube_v3.Youtube {
    const oauth2Client = new OAuth2Client(
      credential.clientId,
      credential.clientSecret,
      credential.redirectUri,
    );

    oauth2Client.setCredentials({
      access_token: credential.accessToken,
      refresh_token: credential.refreshToken,
    });

    oauth2Client.on('tokens', (tokens: Credentials) => {
      if (tokens.refresh_token) {
        this.logger.log('Refresh token received');
      }

      this.logger.log('Access token refreshed');
    });

    return youtube({
      auth: oauth2Client,
      version: 'v3',
    });
  }

  /**
   * Upload video to YouTube with specified privacy status
   */
  async uploadVideo(params: {
    containsSyntheticMedia?: boolean;
    credential: YoutubeCredential;
    ingredientId: string;
    sourceStorageKey?: string;
    title: string;
    description: string;
    tags: string[];
    status: string;
    scheduledDate?: Date;
    selfDeclaredMadeForKids?: boolean;
  }): Promise<string> {
    const {
      credential,
      ingredientId,
      title,
      description,
      tags,
      status,
      scheduledDate,
    } = params;

    try {
      this.logger.log(`Uploading video ${ingredientId} to YouTube`);

      const youtubeAPI = this.createYoutubeAPI(credential);

      // Download video file
      let videoUrl = `${this.configService.ingredientsEndpoint}/videos/${ingredientId}`;
      if (this.configService.isAuthorizedMediaDeliveryEnabled) {
        if (!params.sourceStorageKey || !this.s3Service)
          throw new Error('YouTube source has no authorized stored key');
        videoUrl = await this.s3Service.getPresignedDownloadUrlForStoredKey(
          params.sourceStorageKey,
          300,
        );
      }
      const outputDir = path.join(
        process.cwd(),
        'public',
        'tmp',
        'youtube',
        ingredientId,
      );

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filePath = path.join(outputDir, 'video.mp4');

      // Download file
      const response = await axios.get(videoUrl, {
        responseType: 'stream',
      });

      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        writer.on('finish', () => resolve());
        writer.on('error', (err) => reject(err));
      });

      this.logger.log(`Video downloaded to ${filePath}`);

      const statusConfig = this.buildStatusConfig({
        containsSyntheticMedia: params.containsSyntheticMedia,
        scheduledDate,
        selfDeclaredMadeForKids: params.selfDeclaredMadeForKids,
        status,
      });

      // Upload to YouTube
      const insertParams: youtube_v3.Params$Resource$Videos$Insert = {
        media: {
          body: fs.createReadStream(filePath),
        },
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            description: description || '',
            tags: tags || [],
            title: title || 'Genfeed.ai Video',
          },
          status: statusConfig,
        },
      };
      const res = await youtubeAPI.videos.insert(insertParams, {});

      if (!res.data.id) {
        throw new Error('Failed to upload video to YouTube');
      }

      const youtubeVideoId: string = res.data.id;

      this.logger.log(`Video uploaded to YouTube: ${youtubeVideoId}`);

      // Clean up local file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      if (fs.existsSync(outputDir) && fs.readdirSync(outputDir).length === 0) {
        fs.rmdirSync(outputDir);
      }

      return youtubeVideoId;
    } catch (error: unknown) {
      this.logger.error(`Failed to upload video to YouTube`, error);
      throw error;
    }
  }

  /**
   * The `status` part of the upload. A future scheduled date uploads as private
   * with `publishAt`, so YouTube makes it public at that time. The altered or
   * synthetic content disclosure and the audience declaration stay off the
   * request when the caller does not set them.
   */
  private buildStatusConfig(params: {
    containsSyntheticMedia?: boolean;
    scheduledDate?: Date;
    selfDeclaredMadeForKids?: boolean;
    status: string;
  }): youtube_v3.Schema$VideoStatus {
    const { scheduledDate, status } = params;
    const disclosureConfig: youtube_v3.Schema$VideoStatus = {
      ...(params.containsSyntheticMedia === undefined
        ? {}
        : { containsSyntheticMedia: params.containsSyntheticMedia }),
      ...(params.selfDeclaredMadeForKids === undefined
        ? {}
        : { selfDeclaredMadeForKids: params.selfDeclaredMadeForKids }),
    };

    if (scheduledDate && new Date(scheduledDate) > new Date()) {
      this.logger.log(
        `Scheduling video for future publication: ${scheduledDate.toISOString()}`,
      );
      return {
        ...disclosureConfig,
        privacyStatus: 'private',
        publishAt: scheduledDate.toISOString(),
      };
    }

    // No future date or date has passed: use the provided status. SCHEDULED
    // without a future date means the cron picked it up, so it goes public.
    // An invalid status defaults to private for safety.
    let privacyStatus: string;
    switch (status) {
      case PostStatus.PUBLIC:
      case PostStatus.SCHEDULED:
        privacyStatus = 'public';
        break;
      case PostStatus.UNLISTED:
        privacyStatus = 'unlisted';
        break;
      default:
        privacyStatus = 'private';
    }
    return { ...disclosureConfig, privacyStatus };
  }
}
