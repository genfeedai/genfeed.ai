import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform } from '@genfeedai/enums';
import type {
  GhostImageUploadResponse,
  GhostPostResponse,
  GhostPostsApiResponse,
  GhostSiteApiResponse,
  GhostSiteInfo,
  GhostTag,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const jwt = require('jsonwebtoken') as {
  sign: (
    payload: Record<string, unknown>,
    secretOrPrivateKey: string | Buffer,
    options?: Record<string, unknown>,
  ) => string;
};

@Injectable()
export class GhostService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Generate a Ghost Admin API JWT from an API key.
   * The API key format is `{id}:{secret}`.
   * JWT is signed with HMAC-SHA256, kid=id, exp=5 minutes.
   */
  public generateToken(apiKey: string): string {
    const [id, secret] = apiKey.split(':');

    if (!id || !secret) {
      throw new Error(
        'Invalid Ghost Admin API key format. Expected format: {id}:{secret}',
      );
    }

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 5 * 60; // 5 minutes

    return jwt.sign(
      {
        aud: '/admin/',
        exp,
        iat,
      },
      Buffer.from(secret, 'hex'),
      {
        algorithm: 'HS256',
        header: {
          alg: 'HS256',
          kid: id,
          typ: 'JWT',
        },
      },
    );
  }

  /**
   * Create a post on Ghost via the Admin API.
   */
  public async createPost(
    ghostUrl: string,
    apiKey: string,
    title: string,
    html: string,
    status: 'draft' | 'published' = 'draft',
    featureImage?: string,
    tags?: string[],
  ): Promise<GhostPostResponse> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const token = this.generateToken(apiKey);
      const apiUrl = `${this.normalizeUrl(ghostUrl)}/ghost/api/admin/posts/`;

      const ghostTags: GhostTag[] | undefined = tags?.map((tag) => ({
        name: tag,
      }));

      const response = await firstValueFrom(
        this.httpService.post<GhostPostsApiResponse>(
          apiUrl,
          {
            posts: [
              {
                feature_image: featureImage,
                html,
                status,
                tags: ghostTags,
                title,
              },
            ],
          },
          {
            headers: {
              Authorization: `Ghost ${token}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        postId: response.data.posts[0]?.id,
        status,
      });

      return response.data.posts[0];
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Upload an image to Ghost via the Admin API.
   */
  public async uploadImage(
    ghostUrl: string,
    apiKey: string,
    imageBuffer: Buffer,
    fileName: string,
  ): Promise<string> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const token = this.generateToken(apiKey);
      const apiUrl = `${this.normalizeUrl(ghostUrl)}/ghost/api/admin/images/upload/`;

      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      formData.append('file', imageBuffer, {
        contentType: 'image/jpeg',
        filename: fileName,
      });

      const response = await firstValueFrom(
        this.httpService.post<GhostImageUploadResponse>(apiUrl, formData, {
          headers: {
            Authorization: `Ghost ${token}`,
            ...formData.getHeaders(),
          },
        }),
      );

      this.loggerService.log(`${url} success`, {
        imageUrl: response.data.images[0]?.url,
      });

      return response.data.images[0]?.url ?? '';
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Get site info from Ghost via the Admin API.
   */
  public async getSiteInfo(
    ghostUrl: string,
    apiKey: string,
  ): Promise<GhostSiteInfo> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const token = this.generateToken(apiKey);
      const apiUrl = `${this.normalizeUrl(ghostUrl)}/ghost/api/admin/site/`;

      const response = await firstValueFrom(
        this.httpService.get<GhostSiteApiResponse>(apiUrl, {
          headers: {
            Authorization: `Ghost ${token}`,
          },
        }),
      );

      this.loggerService.log(`${url} success`, {
        siteTitle: response.data.site.title,
      });

      return response.data.site;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Get decrypted API key from a stored credential.
   */
  public async getCredentialApiKey(
    organizationId: string,
    brandId: string,
  ): Promise<{ apiKey: string; ghostUrl: string } | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.credentialsService.findOne({
        brand: brandId,
        isDeleted: false,
        organization: organizationId,
        platform: CredentialPlatform.GHOST,
      });

      if (!credential?.accessToken || !credential?.externalHandle) {
        return null;
      }

      return {
        apiKey: EncryptionUtil.decrypt(credential.accessToken),
        ghostUrl: credential.externalHandle,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Normalize a Ghost URL (strip trailing slashes, ensure https).
   */
  private normalizeUrl(ghostUrl: string): string {
    let normalized = ghostUrl.replace(/\/+$/, '');

    if (
      !normalized.startsWith('http://') &&
      !normalized.startsWith('https://')
    ) {
      normalized = `https://${normalized}`;
    }

    return normalized;
  }
}
