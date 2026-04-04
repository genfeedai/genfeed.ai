import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';

/**
 * Threads API Media Types
 */
export enum ThreadsMediaType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

/**
 * Threads API Container Status
 */
export enum ThreadsContainerStatus {
  EXPIRED = 'EXPIRED',
  ERROR = 'ERROR',
  FINISHED = 'FINISHED',
  IN_PROGRESS = 'IN_PROGRESS',
  PUBLISHED = 'PUBLISHED',
}

@Injectable()
export class ThreadsService {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly graphUrl: string;
  private readonly apiVersion: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.graphUrl =
      this.configService.get('THREADS_GRAPH_URL') ||
      'https://graph.threads.net';
    this.apiVersion = this.configService.get('THREADS_API_VERSION') || 'v1.0';
  }

  /**
   * Get Threads account details
   * @param accessToken The decrypted access token
   * @returns Account details including id, username, threads_profile_picture_url
   */
  public async getAccountDetails(accessToken: string): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.graphUrl}/${this.apiVersion}/me`, {
          params: {
            access_token: accessToken,
            fields: 'id,username,threads_profile_picture_url,threads_biography',
          },
        }),
      );

      this.loggerService.log(`${url} succeeded`, response.data);

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Refresh access token for Threads
   * Threads uses long-lived tokens that can be refreshed
   */
  public async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.credentialsService.findOne({
      brand: new Types.ObjectId(brandId),
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.THREADS,
    });

    if (!credential) {
      throw new Error('Threads credential not found');
    }

    if (!credential.accessToken) {
      await this.credentialsService.patch(credential._id, {
        isConnected: false,
      });
      throw new Error(
        'Threads access token not found. Please reconnect your account.',
      );
    }

    // Decrypt access token before use
    const decryptedAccessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      // Threads uses the same token refresh endpoint as Instagram/Facebook
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/refresh_access_token`,
          {
            params: {
              access_token: decryptedAccessToken,
              grant_type: OAuthGrantType.TH_REFRESH_TOKEN,
            },
          },
        ),
      );

      const { access_token, expires_in } = response.data || {};

      this.loggerService.log(`${url} succeeded`, response.data);

      const updatedCredential = await this.credentialsService.patch(
        credential._id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: true,
        },
      );

      return updatedCredential;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      await this.credentialsService.patch(credential._id, {
        isConnected: false,
      });
      throw error;
    }
  }

  /**
   * Create a media container for a text-only post
   * Step 1 of the two-step publishing process
   */
  public async createTextContainer(
    organizationId: string,
    brandId: string,
    text: string,
    replyToId?: string,
  ): Promise<{ containerId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.getCredential(organizationId, brandId);
    const decryptedAccessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const params: Record<string, string> = {
        access_token: decryptedAccessToken,
        media_type: ThreadsMediaType.TEXT,
        text,
      };

      // If this is a reply to another thread
      if (replyToId) {
        params.reply_to_id = replyToId;
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${credential.externalId}/threads`,
          null,
          { params },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);

      return { containerId: response.data.id };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Create a media container for an image post
   * Step 1 of the two-step publishing process
   */
  public async createImageContainer(
    organizationId: string,
    brandId: string,
    imageUrl: string,
    text?: string,
    replyToId?: string,
  ): Promise<{ containerId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.getCredential(organizationId, brandId);
    const decryptedAccessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const params: Record<string, string> = {
        access_token: decryptedAccessToken,
        image_url: imageUrl,
        media_type: ThreadsMediaType.IMAGE,
      };

      if (text) {
        params.text = text;
      }

      if (replyToId) {
        params.reply_to_id = replyToId;
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${credential.externalId}/threads`,
          null,
          { params },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);

      return { containerId: response.data.id };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Publish a media container
   * Step 2 of the two-step publishing process
   */
  public async publishContainer(
    organizationId: string,
    brandId: string,
    containerId: string,
  ): Promise<{ threadId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.getCredential(organizationId, brandId);
    const decryptedAccessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${credential.externalId}/threads_publish`,
          null,
          {
            params: {
              access_token: decryptedAccessToken,
              creation_id: containerId,
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);

      return { threadId: response.data.id };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Check the status of a media container
   */
  public async getContainerStatus(
    organizationId: string,
    brandId: string,
    containerId: string,
  ): Promise<{ status: ThreadsContainerStatus; errorMessage?: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.getCredential(organizationId, brandId);
    const decryptedAccessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/${containerId}`,
          {
            params: {
              access_token: decryptedAccessToken,
              fields: 'status,error_message',
            },
          },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);

      return {
        errorMessage: response.data.error_message,
        status: response.data.status,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Publish a text-only thread (convenience method combining create + publish)
   */
  public async publishText(
    organizationId: string,
    brandId: string,
    text: string,
    replyToId?: string,
  ): Promise<{ threadId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Validate text length (500 character limit)
      if (text.length > 500) {
        throw new Error('Threads posts are limited to 500 characters');
      }

      // Step 1: Create container
      const { containerId } = await this.createTextContainer(
        organizationId,
        brandId,
        text,
        replyToId,
      );

      // Step 2: Publish container
      const { threadId } = await this.publishContainer(
        organizationId,
        brandId,
        containerId,
      );

      this.loggerService.log(`${url} succeeded`, { threadId });

      return { threadId };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Publish an image thread (convenience method combining create + publish)
   */
  public async publishImage(
    organizationId: string,
    brandId: string,
    imageUrl: string,
    text?: string,
    replyToId?: string,
  ): Promise<{ threadId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      // Validate text length if provided
      if (text && text.length > 500) {
        throw new Error('Threads posts are limited to 500 characters');
      }

      // Step 1: Create container
      const { containerId } = await this.createImageContainer(
        organizationId,
        brandId,
        imageUrl,
        text,
        replyToId,
      );

      // Step 2: Publish container
      const { threadId } = await this.publishContainer(
        organizationId,
        brandId,
        containerId,
      );

      this.loggerService.log(`${url} succeeded`, { threadId });

      return { threadId };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Get insights for a thread
   */
  public async getThreadInsights(
    organizationId: string,
    brandId: string,
    threadId: string,
  ): Promise<{
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.getCredential(organizationId, brandId);
    const decryptedAccessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/${threadId}/insights`,
          {
            params: {
              access_token: decryptedAccessToken,
              metric: 'views,likes,replies,reposts,quotes',
            },
          },
        ),
      );

      const metrics = response.data.data || [];
      const getMetricValue = (name: string): number => {
        const metric = metrics.find((m: unknown) => m.name === name);
        return metric?.values?.[0]?.value || 0;
      };

      this.loggerService.log(`${url} succeeded`, response.data);

      return {
        likes: getMetricValue('likes'),
        quotes: getMetricValue('quotes'),
        replies: getMetricValue('replies'),
        reposts: getMetricValue('reposts'),
        views: getMetricValue('views'),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Get mock trends for Threads (no official trending API)
   */
  public getTrends(): unknown[] {
    const url = `${this.constructorName} getTrends`;

    this.loggerService.log(url);

    // Threads doesn't have an official trending API
    // Return mock data similar to Instagram approach
    return [
      { growthRate: 45, mentions: 850000, platform: 'threads', topic: 'AI' },
      { growthRate: 38, mentions: 720000, platform: 'threads', topic: 'Tech' },
      {
        growthRate: 32,
        mentions: 580000,
        platform: 'threads',
        topic: 'Startup',
      },
      {
        growthRate: 28,
        mentions: 450000,
        platform: 'threads',
        topic: 'Design',
      },
      {
        growthRate: 25,
        mentions: 380000,
        platform: 'threads',
        topic: 'Marketing',
      },
    ];
  }

  /**
   * Helper to get credential and validate it exists
   */
  private async getCredential(
    organizationId: string,
    brandId: string,
  ): Promise<unknown> {
    const credential = await this.credentialsService.findOne({
      brand: new Types.ObjectId(brandId),
      organization: new Types.ObjectId(organizationId),
      platform: CredentialPlatform.THREADS,
    });

    if (!credential) {
      throw new Error('Threads credential not found');
    }

    if (!credential.accessToken) {
      throw new Error('Threads access token not found');
    }

    return credential;
  }
}
