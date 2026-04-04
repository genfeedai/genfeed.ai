import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import FormData from 'form-data';
import { Types } from 'mongoose';
import { firstValueFrom } from 'rxjs';

interface MastodonAppRegistration {
  id: string;
  name: string;
  client_id: string;
  client_secret: string;
  redirect_uri: string;
}

interface MastodonTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  created_at: number;
}

interface MastodonAccount {
  id: string;
  username: string;
  acct: string;
  display_name: string;
  avatar: string;
  url: string;
}

interface MastodonStatus {
  id: string;
  uri: string;
  url: string;
  created_at: string;
}

interface MastodonMediaAttachment {
  id: string;
  type: string;
  url: string;
  preview_url: string;
  description: string | null;
}

@Injectable()
export class MastodonService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Blocked hostnames for SSRF prevention
   */
  private static readonly BLOCKED_HOSTNAMES = new Set([
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '[::]',
    '[::1]',
    'metadata.google.internal',
    'metadata.google',
    'instance-data',
  ]);

  /**
   * Validate that a hostname does not resolve to a private/internal address
   */
  private validateInstanceHost(hostname: string): void {
    const lowerHost = hostname.toLowerCase();

    if (MastodonService.BLOCKED_HOSTNAMES.has(lowerHost)) {
      throw new BadRequestException('Instance URL points to a blocked address');
    }

    // Block private IPv4 ranges
    const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(
      lowerHost,
    );
    if (ipv4Match) {
      const [, a, b] = ipv4Match.map(Number);
      if (
        a === 10 || // 10.0.0.0/8
        (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
        (a === 192 && b === 168) || // 192.168.0.0/16
        (a === 169 && b === 254) || // 169.254.0.0/16 (link-local / cloud metadata)
        a === 127 || // 127.0.0.0/8
        a === 0 // 0.0.0.0/8
      ) {
        throw new BadRequestException(
          'Instance URL points to a private IP range',
        );
      }
    }

    // Block .internal and .local TLDs
    if (lowerHost.endsWith('.internal') || lowerHost.endsWith('.local')) {
      throw new BadRequestException(
        'Instance URL points to an internal hostname',
      );
    }
  }

  /**
   * Normalize an instance URL to ensure it has https:// and no trailing slash.
   * Validates against SSRF by blocking private IPs and internal hostnames.
   */
  private normalizeInstanceUrl(instanceUrl: string): string {
    let normalized = instanceUrl.trim();

    // Only allow https:// — Mastodon instances must use HTTPS
    if (normalized.startsWith('http://')) {
      throw new BadRequestException('Instance URL must use HTTPS');
    }

    if (!normalized.startsWith('https://')) {
      normalized = `https://${normalized}`;
    }

    normalized = normalized.replace(/\/+$/, '');

    // Parse and validate the hostname
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalized);
    } catch {
      throw new BadRequestException('Invalid instance URL');
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new BadRequestException('Instance URL must use HTTPS');
    }

    this.validateInstanceHost(parsedUrl.hostname);

    return normalized;
  }

  /**
   * Register an OAuth application on a Mastodon instance.
   * Each instance requires its own app registration.
   */
  public async registerApp(
    instanceUrl: string,
    redirectUri: string,
  ): Promise<MastodonAppRegistration> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const normalizedUrl = this.normalizeInstanceUrl(instanceUrl);

    try {
      const response = await firstValueFrom(
        this.httpService.post<MastodonAppRegistration>(
          `${normalizedUrl}/api/v1/apps`,
          {
            client_name: 'Genfeed.ai',
            redirect_uris: redirectUri,
            scopes: 'read write push',
            website: this.configService.get('GENFEEDAI_APP_URL'),
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        clientId: response.data.client_id,
        instanceUrl: normalizedUrl,
      });

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Generate the OAuth authorization URL for a Mastodon instance
   */
  public generateAuthUrl(
    instanceUrl: string,
    clientId: string,
    redirectUri: string,
    state: string,
  ): string {
    const normalizedUrl = this.normalizeInstanceUrl(instanceUrl);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'read write push',
      state,
    });
    return `${normalizedUrl}/oauth/authorize?${params.toString()}`;
  }

  /**
   * Exchange an authorization code for an access token
   */
  public async exchangeCodeForToken(
    instanceUrl: string,
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const normalizedUrl = this.normalizeInstanceUrl(instanceUrl);

    try {
      const response = await firstValueFrom(
        this.httpService.post<MastodonTokenResponse>(
          `${normalizedUrl}/oauth/token`,
          {
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: OAuthGrantType.AUTHORIZATION_CODE,
            redirect_uri: redirectUri,
            scope: 'read write push',
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        instanceUrl: normalizedUrl,
        tokenType: response.data.token_type,
      });

      return {
        accessToken: response.data.access_token,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Refresh the access token for a Mastodon credential.
   * Note: Mastodon tokens are typically long-lived and don't expire,
   * so this re-verifies credentials rather than performing a token refresh.
   */
  public async refreshToken(
    organizationId: string,
    brandId: string,
  ): Promise<MastodonAccount> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.MASTODON,
      });

      if (!credential?.accessToken) {
        throw new Error(
          'Mastodon credential not found or missing access token',
        );
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );

      // Mastodon stores instance URL in the description field
      const instanceUrl = credential.description;
      if (!instanceUrl) {
        throw new Error('Mastodon instance URL not found on credential');
      }

      // Verify the token is still valid
      const account = await this.verifyCredentials(
        instanceUrl,
        decryptedAccessToken,
      );

      this.loggerService.log(`${url} success`, {
        accountId: account.id,
        credentialId: credential._id,
        instanceUrl,
      });

      return account;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Verify account credentials on a Mastodon instance
   */
  public async verifyCredentials(
    instanceUrl: string,
    accessToken: string,
  ): Promise<MastodonAccount> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const normalizedUrl = this.normalizeInstanceUrl(instanceUrl);

    try {
      const response = await firstValueFrom(
        this.httpService.get<MastodonAccount>(
          `${normalizedUrl}/api/v1/accounts/verify_credentials`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        accountId: response.data.id,
        username: response.data.username,
      });

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Publish a status (toot) to Mastodon
   */
  public async publishStatus(
    instanceUrl: string,
    accessToken: string,
    status: string,
    mediaIds?: string[],
    inReplyToId?: string,
    visibility: string = 'public',
    isSensitive: boolean = false,
    spoilerText?: string,
  ): Promise<MastodonStatus> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const normalizedUrl = this.normalizeInstanceUrl(instanceUrl);

    try {
      const body: Record<string, unknown> = {
        status,
        visibility,
      };

      if (mediaIds && mediaIds.length > 0) {
        body.media_ids = mediaIds;
      }

      if (inReplyToId) {
        body.in_reply_to_id = inReplyToId;
      }

      if (isSensitive) {
        body.sensitive = true;
      }

      if (spoilerText) {
        body.spoiler_text = spoilerText;
      }

      const response = await firstValueFrom(
        this.httpService.post<MastodonStatus>(
          `${normalizedUrl}/api/v1/statuses`,
          body,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        statusId: response.data.id,
        statusUrl: response.data.url,
      });

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Upload media to a Mastodon instance
   */
  public async uploadMedia(
    instanceUrl: string,
    accessToken: string,
    mediaUrl: string,
    description?: string,
  ): Promise<MastodonMediaAttachment> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const normalizedUrl = this.normalizeInstanceUrl(instanceUrl);

    try {
      // Download the media file first
      const mediaResponse = await firstValueFrom(
        this.httpService.get(mediaUrl, {
          responseType: 'arraybuffer',
        }),
      );

      const form = new FormData();
      form.append('file', Buffer.from(mediaResponse.data), {
        contentType:
          mediaResponse.headers['content-type'] || 'application/octet-stream',
        filename: 'media',
      });

      if (description) {
        form.append('description', description);
      }

      const response = await firstValueFrom(
        this.httpService.post<MastodonMediaAttachment>(
          `${normalizedUrl}/api/v2/media`,
          form,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              ...form.getHeaders(),
            },
          },
        ),
      );

      this.loggerService.log(`${url} success`, {
        mediaId: response.data.id,
        mediaType: response.data.type,
      });

      return response.data;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * Get media analytics for a Mastodon status
   */
  public async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    externalId: string,
  ): Promise<{
    views: number;
    likes: number;
    comments: number;
    boosts: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.MASTODON,
      });

      if (!credential?.accessToken || !credential?.description) {
        this.loggerService.warn(`${url} Mastodon credential not found`, {
          brandId,
          externalId,
          organizationId,
        });
        return { boosts: 0, comments: 0, likes: 0, views: 0 };
      }

      const decryptedAccessToken = EncryptionUtil.decrypt(
        credential.accessToken,
      );
      const instanceUrl = credential.description;
      const normalizedUrl = this.normalizeInstanceUrl(instanceUrl);

      const response = await firstValueFrom(
        this.httpService.get<
          MastodonStatus & {
            favourites_count: number;
            reblogs_count: number;
            replies_count: number;
          }
        >(`${normalizedUrl}/api/v1/statuses/${externalId}`, {
          headers: { Authorization: `Bearer ${decryptedAccessToken}` },
        }),
      );

      return {
        boosts: response.data.reblogs_count || 0,
        comments: response.data.replies_count || 0,
        likes: response.data.favourites_count || 0,
        views: 0, // Mastodon does not expose view counts
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return { boosts: 0, comments: 0, likes: 0, views: 0 };
    }
  }
}
