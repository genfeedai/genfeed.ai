import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { assertHostNotPrivate } from '@api/helpers/utils/ssrf/ssrf.util';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Injectable } from '@nestjs/common';
import FormData from 'form-data';
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
   * Validate that a hostname does not resolve to a private/internal address.
   * Delegates to the shared SSRF util (single fix path for bypasses).
   */
  private validateInstanceHost(hostname: string): void {
    assertHostNotPrivate(hostname);
  }

  /**
   * Only app-owned redirect URIs may participate in the OAuth flow.
   * A caller-supplied arbitrary redirectUri turns the API into an open
   * redirector / token-exfiltration helper.
   */
  private assertRedirectUriAllowed(redirectUri: string): void {
    const appUrl = (
      this.configService.get('GENFEEDAI_APP_URL') as string | undefined
    )?.replace(/\/+$/, '');

    if (!appUrl) {
      this.loggerService.warn(
        'MastodonService GENFEEDAI_APP_URL not configured — skipping redirectUri allowlist',
      );
      return;
    }

    if (
      redirectUri !== appUrl &&
      !redirectUri.startsWith(`${appUrl}/`) &&
      redirectUri !== 'urn:ietf:wg:oauth:2.0:oob'
    ) {
      throw new BadRequestException('redirectUri is not allowed');
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
    this.assertRedirectUriAllowed(redirectUri);
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
    this.assertRedirectUriAllowed(redirectUri);
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
    this.assertRedirectUriAllowed(redirectUri);
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
        brand: brandId,
        isDeleted: false,
        organization: organizationId,
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
        credentialId: credential.id,
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
      const contentTypeHeader = mediaResponse.headers['content-type'];
      const contentType =
        typeof contentTypeHeader === 'string'
          ? contentTypeHeader
          : 'application/octet-stream';
      form.append('file', Buffer.from(mediaResponse.data), {
        contentType,
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
        brand: brandId,
        isDeleted: false,
        organization: organizationId,
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
