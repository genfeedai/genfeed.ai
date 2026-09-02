import { InstagramMediaType } from '@genfeedai/contracts';
import type { InstagramCredentialResponse } from '@genfeedai/contracts/interfaces/integrations/instagram.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type ResolveInstagramCredential = (
  organizationId: string,
  brandId: string,
  credentialId?: string,
) => Promise<InstagramCredentialResponse>;

function requireString(
  value: string | null | undefined,
  field: string,
): string {
  if (!value) {
    throw new Error(`Instagram credential is missing ${field}`);
  }

  return value;
}

function formatCaption(caption: string, hashtags?: string[]): string {
  if (!hashtags?.length) {
    return caption;
  }
  return `${caption}\n\n${hashtags.map((tag) => `#${tag}`).join(' ')}`;
}

/** Owns Instagram write operations while the facade retains credential APIs. */
export class InstagramPublishingService {
  constructor(
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly graphUrl: string,
    private readonly apiVersion: string,
    private readonly resolveCredential: ResolveInstagramCredential,
  ) {}

  async sendCommentReplyDm(
    organizationId: string,
    brandId: string,
    recipientId: string,
    message: string,
    credentialId?: string,
  ): Promise<string | undefined> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const externalId = requireString(credential.externalId, 'externalId');
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/messages`,
          {
            message: { text: message },
            messaging_product: 'instagram',
            messaging_type: 'RESPONSE',
            recipient: { id: recipientId },
          },
          { params: { access_token: accessToken } },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);
      return response.data?.id;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async uploadImage(
    organizationId: string,
    brandId: string,
    imageUrl: string,
    caption: string,
    hashtags?: string[],
    credentialId?: string,
  ): Promise<{ mediaId: string; shortcode: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const createRes = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/media`,
          null,
          {
            params: {
              access_token: accessToken,
              caption: formatCaption(caption, hashtags),
              image_url: imageUrl,
            },
          },
        ),
      );
      const publishRes = await this.publishContainer(
        externalId,
        createRes.data.id,
        accessToken,
      );

      this.loggerService.log(`${url} succeeded`, publishRes.data);
      const mediaId = publishRes.data.id;
      return {
        mediaId,
        shortcode: await this.getMediaShortcode(mediaId, accessToken),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async uploadReel(
    organizationId: string,
    brandId: string,
    videoUrl: string,
    caption: string,
    coverImageUrl?: string,
    hashtags?: string[],
    isShareToFeedSelected = true,
    credentialId?: string,
  ): Promise<{ mediaId: string; shortcode: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const params: Record<string, string | boolean> = {
        access_token: accessToken,
        caption: formatCaption(caption, hashtags),
        media_type: InstagramMediaType.REELS,
        share_to_feed: isShareToFeedSelected,
        video_url: videoUrl,
      };
      if (coverImageUrl) {
        params.cover_url = coverImageUrl;
      }

      const createRes = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/media`,
          null,
          { params },
        ),
      );
      const containerId = createRes.data.id;
      await this.waitForMediaProcessing(containerId, accessToken);
      const publishRes = await this.publishContainer(
        externalId,
        containerId,
        accessToken,
      );

      this.loggerService.log(`${url} succeeded`, publishRes.data);
      const mediaId = publishRes.data.id;
      return {
        mediaId,
        shortcode: await this.getMediaShortcode(mediaId, accessToken),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async uploadCarousel(
    organizationId: string,
    brandId: string,
    mediaUrls: string[],
    caption: string,
    hashtags?: string[],
    credentialId?: string,
  ): Promise<{ mediaId: string; shortcode: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const externalId = requireString(credential.externalId, 'externalId');
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);

    try {
      const containerIds = [];
      for (const mediaUrl of mediaUrls) {
        const response = await firstValueFrom(
          this.httpService.post(
            `${this.graphUrl}/${this.apiVersion}/${externalId}/media`,
            null,
            {
              params: {
                access_token: accessToken,
                image_url: mediaUrl,
                is_carousel_item: true,
              },
            },
          ),
        );
        containerIds.push(response.data.id);
      }

      const carouselRes = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${externalId}/media`,
          null,
          {
            params: {
              access_token: accessToken,
              caption: formatCaption(caption, hashtags),
              children: containerIds.join(','),
              media_type: InstagramMediaType.CAROUSEL,
            },
          },
        ),
      );
      const publishRes = await this.publishContainer(
        externalId,
        carouselRes.data.id,
        accessToken,
      );

      this.loggerService.log(`${url} succeeded`, publishRes.data);
      const mediaId = publishRes.data.id;
      return {
        mediaId,
        shortcode: await this.getMediaShortcode(mediaId, accessToken),
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  async postComment(
    organizationId: string,
    brandId: string,
    mediaId: string,
    text: string,
    credentialId?: string,
  ): Promise<{ commentId: string }> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.graphUrl}/${this.apiVersion}/${mediaId}/comments`,
          null,
          { params: { access_token: accessToken, message: text } },
        ),
      );

      this.loggerService.log(`${url} succeeded`, response.data);
      return { commentId: response.data.id };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  private publishContainer(
    externalId: string,
    containerId: string,
    accessToken: string,
  ) {
    return firstValueFrom(
      this.httpService.post(
        `${this.graphUrl}/${this.apiVersion}/${externalId}/media_publish`,
        null,
        {
          params: {
            access_token: accessToken,
            creation_id: containerId,
          },
        },
      ),
    );
  }

  private async waitForMediaProcessing(
    containerId: string,
    accessToken: string,
    maxAttempts = 30,
    delayMs = 2000,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const statusRes = await firstValueFrom(
        this.httpService.get(
          `${this.graphUrl}/${this.apiVersion}/${containerId}`,
          { params: { access_token: accessToken, fields: 'status_code' } },
        ),
      );
      if (statusRes.data.status_code === 'FINISHED') {
        return;
      }
      if (statusRes.data.status_code === 'ERROR') {
        throw new Error('Media processing failed');
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Media processing timeout');
  }

  private async getMediaShortcode(
    mediaId: string,
    accessToken: string,
  ): Promise<string> {
    const url = `InstagramService ${CallerUtil.getCallerName()}`;

    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.graphUrl}/${this.apiVersion}/${mediaId}`, {
          params: { access_token: accessToken, fields: 'shortcode' },
        }),
      );
      const shortcode = response.data?.shortcode;
      if (!shortcode) {
        this.loggerService.error(
          `${url} - No shortcode found in response, using numeric ID`,
          { mediaId },
        );
        return mediaId;
      }

      this.loggerService.log(`${url} - Retrieved shortcode for media`, {
        mediaId,
        shortcode,
      });
      return shortcode;
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} - Failed to fetch shortcode, using numeric ID`,
        { error, mediaId },
      );
      return mediaId;
    }
  }
}
