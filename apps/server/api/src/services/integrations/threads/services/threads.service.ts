import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

/**
 * Threads API Media Types
 */
export enum ThreadsMediaType {
  CAROUSEL = 'CAROUSEL',
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
}

export type ThreadsCarouselMediaItem = {
  mediaType: ThreadsMediaType.IMAGE | ThreadsMediaType.VIDEO;
  url: string;
  altText?: string;
};

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
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {
    this.graphUrl =
      this.configService.get('THREADS_GRAPH_URL') ||
      'https://graph.threads.net';
    this.apiVersion = this.configService.get('THREADS_API_VERSION') || 'v1.0';
  }

  private requireString(
    value: string | null | undefined,
    label: string,
  ): string {
    if (!value) {
      throw new Error(`${label} is required`);
    }

    return value;
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

      this.loggerService.log(`${url} succeeded`, {
        hasAccount: !!response.data,
      });

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
    credentialId?: string,
  ): Promise<unknown> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      // Token repair has to find the row even after a failed refresh
      // flipped `isConnected` off.
      isDisconnectedIncluded: true,
      organizationId,
      platform: CredentialPlatform.THREADS,
    });

    if (!credential) {
      throw new Error('Threads credential not found');
    }

    if (!credential.accessToken) {
      await this.credentialsService.patch(credential.id, {
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

      if (!access_token) {
        throw new Error('Threads refresh response missing access token');
      }

      this.loggerService.log(`${url} succeeded`, {
        expiresIn: expires_in,
        hasAccessToken: true,
      });

      const updatedCredential = await this.credentialsService.patch(
        credential.id,
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
      await this.credentialsService.patch(credential.id, {
        isConnected: false,
      });
      throw error;
    }
  }

  /**
   * Create a media container for a text-only post
   * Step 1 of the two-step publishing process
   */
  /**
   * @param credentialId - which connected Threads account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async createTextContainer(
    organizationId: string,
    brandId: string,
    text: string,
    replyToId?: string,
    credentialId?: string,
  ): Promise<{ containerId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.getCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireString(credential.accessToken, 'Threads access token'),
    );
    const externalId = this.requireString(
      credential.externalId,
      'Threads externalId',
    );

    try {
      const params: Record<string, string | boolean> = {
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
          `${this.graphUrl}/${this.apiVersion}/${externalId}/threads`,
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
  /**
   * @param credentialId - which connected Threads account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async createImageContainer(
    organizationId: string,
    brandId: string,
    imageUrl: string,
    text?: string,
    replyToId?: string,
    options: { altText?: string; isCarouselItem?: boolean } = {},
    credentialId?: string,
  ): Promise<{ containerId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.getCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireString(credential.accessToken, 'Threads access token'),
    );
    const externalId = this.requireString(
      credential.externalId,
      'Threads externalId',
    );

    try {
      const params: Record<string, string | boolean> = {
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

      if (options.altText) {
        params.alt_text = options.altText;
      }

      if (options.isCarouselItem) {
        params.is_carousel_item = true;
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/threads`,
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
   * Create a media container for a video post
   * Step 1 of the two-step publishing process
   */
  /**
   * @param credentialId - which connected Threads account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async createVideoContainer(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    text?: string,
    replyToId?: string,
    options: { altText?: string; isCarouselItem?: boolean } = {},
    credentialId?: string,
  ): Promise<{ containerId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.getCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireString(credential.accessToken, 'Threads access token'),
    );
    const externalId = this.requireString(
      credential.externalId,
      'Threads externalId',
    );

    try {
      const params: Record<string, string | boolean> = {
        access_token: decryptedAccessToken,
        media_type: ThreadsMediaType.VIDEO,
        video_url: videoUrl,
      };

      if (text) {
        params.text = text;
      }

      if (replyToId) {
        params.reply_to_id = replyToId;
      }

      if (options.altText) {
        params.alt_text = options.altText;
      }

      if (options.isCarouselItem) {
        params.is_carousel_item = true;
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/threads`,
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
   * Create a carousel container from previously-created item containers.
   */
  /**
   * @param credentialId - which connected Threads account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async createCarouselContainer(
    organizationId: string,
    brandId: string,
    childrenContainerIds: string[],
    text?: string,
    replyToId?: string,
    credentialId?: string,
  ): Promise<{ containerId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (childrenContainerIds.length < 2 || childrenContainerIds.length > 20) {
      throw new Error('Threads carousels require between 2 and 20 media items');
    }

    const credential = await this.getCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireString(credential.accessToken, 'Threads access token'),
    );
    const externalId = this.requireString(
      credential.externalId,
      'Threads externalId',
    );

    try {
      const params: Record<string, string | boolean> = {
        access_token: decryptedAccessToken,
        children: childrenContainerIds.join(','),
        media_type: ThreadsMediaType.CAROUSEL,
      };

      if (text) {
        params.text = text;
      }

      if (replyToId) {
        params.reply_to_id = replyToId;
      }

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/threads`,
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
  /**
   * @param credentialId - which connected Threads account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async publishContainer(
    organizationId: string,
    brandId: string,
    containerId: string,
    credentialId?: string,
  ): Promise<{ threadId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.getCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireString(credential.accessToken, 'Threads access token'),
    );
    const externalId = this.requireString(
      credential.externalId,
      'Threads externalId',
    );

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/threads_publish`,
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
  /**
   * @param credentialId - which connected Threads account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async getContainerStatus(
    organizationId: string,
    brandId: string,
    containerId: string,
    credentialId?: string,
  ): Promise<{ status: ThreadsContainerStatus; errorMessage?: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.getCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireString(credential.accessToken, 'Threads access token'),
    );

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
  /**
   * @param credentialId - which connected Threads account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async publishText(
    organizationId: string,
    brandId: string,
    text: string,
    replyToId?: string,
    credentialId?: string,
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
        credentialId,
      );

      // Step 2: Publish container
      const { threadId } = await this.publishContainer(
        organizationId,
        brandId,
        containerId,
        credentialId,
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
  /**
   * @param credentialId - which connected Threads account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async publishImage(
    organizationId: string,
    brandId: string,
    imageUrl: string,
    text?: string,
    replyToId?: string,
    credentialId?: string,
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
        undefined, // options
        credentialId,
      );

      // Step 2: Publish container
      const { threadId } = await this.publishContainer(
        organizationId,
        brandId,
        containerId,
        credentialId,
      );

      this.loggerService.log(`${url} succeeded`, { threadId });

      return { threadId };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Publish a video thread (convenience method combining create + publish)
   */
  /**
   * @param credentialId - which connected Threads account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async publishVideo(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    text?: string,
    replyToId?: string,
    credentialId?: string,
  ): Promise<{ threadId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      if (text && text.length > 500) {
        throw new Error('Threads posts are limited to 500 characters');
      }

      const { containerId } = await this.createVideoContainer(
        organizationId,
        brandId,
        videoUrl,
        text,
        replyToId,
        undefined, // options
        credentialId,
      );

      await this.waitForContainerReady(
        organizationId,
        brandId,
        containerId,
        undefined, // maxAttempts
        undefined, // delayMs
        credentialId,
      );

      const { threadId } = await this.publishContainer(
        organizationId,
        brandId,
        containerId,
        credentialId,
      );

      this.loggerService.log(`${url} succeeded`, { threadId });

      return { threadId };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Publish a carousel thread with image and/or video media items.
   */
  /**
   * @param credentialId - which connected Threads account this runs as. A brand
   *   may hold several; without an id this falls back to its oldest one.
   */
  public async publishCarousel(
    organizationId: string,
    brandId: string,
    mediaItems: ThreadsCarouselMediaItem[],
    text?: string,
    replyToId?: string,
    credentialId?: string,
  ): Promise<{ threadId: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      if (text && text.length > 500) {
        throw new Error('Threads posts are limited to 500 characters');
      }

      if (mediaItems.length < 2 || mediaItems.length > 20) {
        throw new Error(
          'Threads carousels require between 2 and 20 media items',
        );
      }

      const itemContainerIds: string[] = [];
      for (const item of mediaItems) {
        const { containerId } =
          item.mediaType === ThreadsMediaType.VIDEO
            ? await this.createVideoContainer(
                organizationId,
                brandId,
                item.url,
                undefined,
                undefined,
                { altText: item.altText, isCarouselItem: true },
                credentialId,
              )
            : await this.createImageContainer(
                organizationId,
                brandId,
                item.url,
                undefined,
                undefined,
                { altText: item.altText, isCarouselItem: true },
                credentialId,
              );

        if (item.mediaType === ThreadsMediaType.VIDEO) {
          await this.waitForContainerReady(
            organizationId,
            brandId,
            containerId,
            undefined, // maxAttempts
            undefined, // delayMs
            credentialId,
          );
        }

        itemContainerIds.push(containerId);
      }

      const { containerId } = await this.createCarouselContainer(
        organizationId,
        brandId,
        itemContainerIds,
        text,
        replyToId,
        credentialId,
      );

      const { threadId } = await this.publishContainer(
        organizationId,
        brandId,
        containerId,
        credentialId,
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
    credentialId?: string,
  ): Promise<{
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    quotes: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const credential = await this.getCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const decryptedAccessToken = EncryptionUtil.decrypt(
      this.requireString(credential.accessToken, 'Threads access token'),
    );

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
        const metric = Array.isArray(metrics)
          ? metrics.find((entry) => {
              if (typeof entry !== 'object' || entry === null) {
                return false;
              }

              return (entry as Record<string, unknown>).name === name;
            })
          : undefined;

        const metricRecord =
          typeof metric === 'object' && metric !== null
            ? (metric as Record<string, unknown>)
            : {};
        const values = Array.isArray(metricRecord.values)
          ? metricRecord.values
          : [];
        const firstValue =
          values.length > 0 &&
          typeof values[0] === 'object' &&
          values[0] !== null
            ? (values[0] as Record<string, unknown>).value
            : undefined;

        return typeof firstValue === 'number' ? firstValue : 0;
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

  public getTrends(): unknown[] {
    const url = `${this.constructorName} getTrends`;

    this.loggerService.log(url);
    this.loggerService.warn(`${url} skipped - Threads trends unavailable`, {
      reason: 'threads_trending_api_unavailable',
    });

    return [];
  }

  private async waitForContainerReady(
    organizationId: string,
    brandId: string,
    containerId: string,
    maxAttempts: number = 30,
    delayMs: number = 2000,
    credentialId?: string,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { errorMessage, status } = await this.getContainerStatus(
        organizationId,
        brandId,
        containerId,
        credentialId,
      );

      if (
        status === ThreadsContainerStatus.FINISHED ||
        status === ThreadsContainerStatus.PUBLISHED
      ) {
        return;
      }

      if (
        status === ThreadsContainerStatus.ERROR ||
        status === ThreadsContainerStatus.EXPIRED
      ) {
        throw new Error(errorMessage || `Threads container ${status}`);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Threads media processing timeout');
  }

  /**
   * Resolve the Threads account to act as, and validate it can be used.
   *
   * An explicit `credentialId` is exact; without one the brand's connected
   * account answers, and a brand running several of them gets the resolver's
   * ambiguity warning rather than a silent pick.
   */
  private async getCredential(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<CredentialDocument> {
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      organizationId,
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
