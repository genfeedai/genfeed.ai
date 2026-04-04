import * as fs from 'node:fs';
import * as path from 'node:path';
import { ConfigService } from '@files/config/config.service';
import { PostStatus } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { google } from 'googleapis';

@Injectable()
export class YoutubeService {
  private youtubeAPI: ReturnType<typeof google.youtube> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Initialize YouTube API with credentials
   */
  private initializeYoutubeAPI(credential: unknown): void {
    const oauth2Client = new google.auth.OAuth2(
      credential.clientId,
      credential.clientSecret,
      credential.redirectUri,
    );

    oauth2Client.setCredentials({
      access_token: credential.accessToken,
      refresh_token: credential.refreshToken,
    });

    // Handle token refresh
    oauth2Client.on('tokens', (tokens: unknown) => {
      if (tokens.refresh_token) {
        this.logger.log('Refresh token received');
      }

      this.logger.log('Access token refreshed');
    });

    this.youtubeAPI = google.youtube({
      auth: oauth2Client,
      version: 'v3',
    });
  }

  /**
   * Upload video to YouTube with specified privacy status
   */
  async uploadVideo(params: {
    credential: unknown;
    ingredientId: string;
    title: string;
    description: string;
    tags: string[];
    status: string;
    scheduledDate?: Date;
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

      // Initialize YouTube API
      this.initializeYoutubeAPI(credential);

      // Download video file
      const videoUrl = `${this.configService.ingredientsEndpoint}/videos/${ingredientId}`;
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

      // Determine YouTube privacy status and handle scheduled uploads
      // If scheduledDate is in the future, upload as PRIVATE with publishAt
      // YouTube will automatically publish the video at the specified time
      const hasFutureScheduledDate =
        scheduledDate && new Date(scheduledDate) > new Date();

      let privacyStatus: string;
      let statusConfig: unknown;

      if (hasFutureScheduledDate) {
        // Future scheduled date: upload as private with publishAt
        // YouTube will automatically make it public at the scheduled time
        statusConfig = {
          privacyStatus: 'private',
          publishAt: scheduledDate.toISOString(),
        };
        this.logger.log(
          `Scheduling video for future publication: ${scheduledDate.toISOString()}`,
        );
      } else {
        // No future date or date has passed: use the provided status
        switch (status) {
          case PostStatus.PUBLIC:
            privacyStatus = 'public';
            break;
          case PostStatus.PRIVATE:
            privacyStatus = 'private';
            break;
          case PostStatus.UNLISTED:
            privacyStatus = 'unlisted';
            break;
          case PostStatus.SCHEDULED:
            // SCHEDULED but no future date means cron picked it up (date passed)
            privacyStatus = 'public';
            break;
          default:
            // Invalid status, default to private for safety
            privacyStatus = 'private';
        }
        statusConfig = { privacyStatus };
      }

      // Prepare upload request
      const body: unknown = {
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

      // Upload to YouTube
      if (!this.youtubeAPI) {
        throw new Error('YouTube API not initialized');
      }

      const res = await this.youtubeAPI.videos.insert(body);

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
}
