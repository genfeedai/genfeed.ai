import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { YoutubeOAuth2Util } from '@api/shared/utils/youtube-oauth/youtube-oauth.util';
import { JobState } from '@genfeedai/enums';
import type {
  IFileProcessingJob,
  IFrameInput,
  IJobResponse,
  IJobStatusResponse,
  IQueueStats,
  IVideoDimensions,
  IYoutubeCredentialUpdate,
  IYoutubeUploadData,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

type FileProcessingJob = IFileProcessingJob;
type JobResponse = IJobResponse;

export type { FileProcessingJob, JobResponse };

@Injectable()
export class FileQueueService {
  private readonly filesServiceUrl: string;

  constructor(
    private readonly configService: ConfigService,

    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly credentialsService: CredentialsService,
  ) {
    this.filesServiceUrl =
      this.configService.get('GENFEEDAI_MICROSERVICES_FILES_URL') ??
      'http://localhost:3012';
  }

  /**
   * Refresh YouTube OAuth token
   */
  private async refreshYoutubeToken(credential: {
    _id: Types.ObjectId;
    refreshToken: string;
  }): Promise<{
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
  }> {
    try {
      // Use centralized OAuth2 client factory
      const oauth2Client = YoutubeOAuth2Util.createClient(
        this.configService.get('YOUTUBE_CLIENT_ID')!,
        // @ts-expect-error TS2345
        this.configService.get<string>('YOUTUBE_CLIENT_SECRET')!,
        this.configService.get<string>('YOUTUBE_REDIRECT_URI')!,
      );

      // Decrypt refresh token
      const decryptedRefreshToken = EncryptionUtil.decrypt(
        credential.refreshToken,
      );

      // Set credentials with refresh token
      oauth2Client.setCredentials({
        refresh_token: decryptedRefreshToken,
      });

      // Get new access token (side effect: populates oauth2Client.credentials)
      await oauth2Client.getAccessToken();
      const newCredentials = oauth2Client.credentials;

      if (!newCredentials?.access_token) {
        throw new Error('Failed to obtain access token from refresh');
      }

      // Update credential in database
      const updateData: IYoutubeCredentialUpdate = {
        accessToken: newCredentials.access_token,
        isConnected: true,
      };

      if (newCredentials.refresh_token) {
        updateData.refreshToken = newCredentials.refresh_token;
      }

      if (newCredentials.expiry_date) {
        updateData.accessTokenExpiry = new Date(newCredentials.expiry_date);
      }

      await this.credentialsService.patch(credential._id, updateData);

      this.loggerService.log('YouTube token refreshed successfully');

      return newCredentials;
    } catch (error: unknown) {
      this.loggerService.error('Failed to refresh YouTube token', error);

      // Mark credential as disconnected
      await this.credentialsService.patch(credential._id, {
        isConnected: false,
      });

      throw error;
    }
  }

  async processVideo(job: FileProcessingJob): Promise<JobResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/process/video`,
          job,
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to queue video processing job', error);
      throw error;
    }
  }

  async processImage(job: FileProcessingJob): Promise<JobResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/process/image`,
          job,
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to queue image processing job', error);
      throw error;
    }
  }

  async processFile(job: FileProcessingJob): Promise<JobResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/process/file`,
          job,
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to queue file processing job', error);
      throw error;
    }
  }

  async getJobStatus(jobId: string): Promise<IJobStatusResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.filesServiceUrl}/v1/files/job/${jobId}`),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`Failed to get job status for ${jobId}`, error);
      throw error;
    }
  }

  async waitForJob(
    jobId: string,
    timeout: number = 60000,
  ): Promise<Record<string, unknown>> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const status = await this.getJobStatus(jobId);

      if (status.state === JobState.COMPLETED) {
        // @ts-expect-error TS2322
        return status.result;
      }

      if (status.state === JobState.FAILED) {
        throw new Error(status.failedReason || 'Job failed');
      }

      // Wait 1 second before checking again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Job timeout');
  }

  async getQueueStats(): Promise<IQueueStats> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.filesServiceUrl}/v1/files/stats`),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to get queue statistics', error);
      throw error;
    }
  }

  // Helper methods for common operations
  addWatermark(
    ingredientId: string,
    filePath: string,
    text?: string,
  ): Promise<JobResponse> {
    return this.processFile({
      filePath,
      ingredientId,
      organizationId: 'system',
      params: {
        filePath,
        watermarkText: text,
      },
      type: 'add-watermark',
      userId: 'system',
    });
  }

  createGif(
    ingredientId: string,
    videoPath: string,
    options?: Record<string, unknown>,
  ): Promise<IJobResponse> {
    return this.processVideo({
      ingredientId,
      organizationId: 'system',
      params: {
        inputPath: videoPath,
        ...options,
      },
      type: 'video-to-gif',
      userId: 'system',
    });
  }

  convertToPortrait(
    ingredientId: string,
    videoPath: string,
    dimensions?: IVideoDimensions,
  ): Promise<IJobResponse> {
    return this.processVideo({
      ingredientId,
      organizationId: 'system',
      params: {
        height: dimensions?.height || 1920,
        inputPath: videoPath,
        width: dimensions?.width || 1080,
      },
      type: 'convert-to-portrait',
      userId: 'system',
    });
  }

  prepareAllFiles(
    ingredientId: string,
    frames: IFrameInput[],
    musicId?: string,
  ): Promise<IJobResponse> {
    return this.processFile({
      ingredientId,
      organizationId: 'system',
      params: {
        frames,
        musicId,
      },
      type: 'prepare-all-files',
      userId: 'system',
    });
  }

  cleanupTempFiles(ingredientId: string, delay?: number): Promise<JobResponse> {
    return this.processFile({
      delay,
      ingredientId,
      organizationId: 'system',
      params: {
        isDeleteOutputEnabled: true,
      },
      type: 'cleanup-temp-files',
      userId: 'system',
    });
  }

  async uploadYoutube(data: IYoutubeUploadData): Promise<IJobResponse> {
    try {
      // Fetch credential from database
      const credential = await this.credentialsService.findOne({
        _id: new Types.ObjectId(data.credentialId),
        isConnected: true,
        isDeleted: false,
      });

      if (!credential) {
        throw new Error('YouTube credential not found or not connected');
      }

      // Refresh token to ensure it's valid
      this.loggerService.log('Refreshing YouTube token before upload');
      await this.refreshYoutubeToken(credential);

      // Re-fetch credential to get the refreshed token
      const refreshedCredential = await this.credentialsService.findOne({
        _id: new Types.ObjectId(data.credentialId),
      });

      if (!refreshedCredential) {
        throw new Error('Failed to fetch refreshed credential');
      }

      // Decrypt tokens before sending to Files microservice
      const decryptedAccessToken = EncryptionUtil.decrypt(
        refreshedCredential.accessToken,
      );
      const decryptedRefreshToken = EncryptionUtil.decrypt(
        refreshedCredential.refreshToken,
      );

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.filesServiceUrl}/v1/files/process/youtube`,
          {
            brandId: data.brandId,
            clerkUserId: data.clerkUserId,
            credential: {
              accessToken: decryptedAccessToken,
              clientId: this.configService.get('YOUTUBE_CLIENT_ID'),
              clientSecret: this.configService.get('YOUTUBE_CLIENT_SECRET'),
              redirectUri: this.configService.get('YOUTUBE_REDIRECT_URI'),
              refreshToken: decryptedRefreshToken,
            },
            description: data.description,
            id: data.postId,
            ingredientId: data.ingredientId,
            metadata: {
              websocketUrl: data.websocketUrl || '',
            },
            organizationId: data.organizationId,
            postId: data.postId,
            room: data.room,
            scheduledDate: data.scheduledDate,
            status: data.status,
            tags: data.tags,
            title: data.title,
            type: 'upload-youtube',
            userId: data.userId,
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      this.loggerService.error('Failed to queue YouTube upload job', error);
      throw error;
    }
  }
}
