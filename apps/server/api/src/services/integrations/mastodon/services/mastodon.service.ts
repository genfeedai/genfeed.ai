import type { Agent as HttpsAgent } from 'node:https';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import type { ProviderVerificationPage } from '@api/services/integrations/publishers/interfaces/publish-verification.interface';
import type { PublishContext } from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { PROVIDER_VERIFICATION_REQUEST_TIMEOUT_MS } from '@api/services/integrations/publishers/publisher-verification.util';
import { parseMastodonVerificationPage } from '@api/services/integrations/publishers/publisher-verification-pages.util';
import { trimTrailingCharacter } from '@api/shared/utils/linear-string.util';
import { assertHostNotPrivate } from '@api/shared/utils/ssrf.util';
import { createSafeWebhookHttpsAgent } from '@api/shared/utils/webhook-validator/webhook-validator.util';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/contracts';
import { readChannelSettingString } from '@genfeedai/contracts/api-types/contracts/channel-capabilities.contract';
import { MAX_FILE_SIZE } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import FormData from 'form-data';
import { firstValueFrom } from 'rxjs';

const MASTODON_REQUEST_TIMEOUT_MS = 30_000;

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
  header?: string;
  url: string;
}

interface MastodonStatus {
  id: string;
  uri: string;
  url: string;
  created_at: string;
}

interface MastodonMediaDownload {
  buffer: Buffer;
  contentType: string;
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
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Reject known internal hostname literals during synchronous normalization.
   * Requests additionally resolve and pin the destination through the HTTPS agent.
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
    const configuredAppUrl = this.configService.get('GENFEEDAI_APP_URL') as
      | string
      | undefined;
    const appUrl = configuredAppUrl
      ? trimTrailingCharacter(configuredAppUrl, '/')
      : undefined;

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

    normalized = trimTrailingCharacter(normalized, '/');

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalized);
    } catch {
      throw new BadRequestException('Invalid instance URL');
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new BadRequestException('Instance URL must use HTTPS');
    }

    if (
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      throw new BadRequestException(
        'Instance URL must not contain credentials, a query, or a fragment',
      );
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
    const httpsAgent = await createSafeWebhookHttpsAgent(normalizedUrl);

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
          { httpsAgent, maxRedirects: 0, timeout: MASTODON_REQUEST_TIMEOUT_MS },
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
    } finally {
      httpsAgent.destroy();
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
    const httpsAgent = await createSafeWebhookHttpsAgent(normalizedUrl);

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
          { httpsAgent, maxRedirects: 0, timeout: MASTODON_REQUEST_TIMEOUT_MS },
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
    } finally {
      httpsAgent.destroy();
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
    credentialId?: string,
  ): Promise<MastodonAccount> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.credentialsService.resolveBrandAccount({
        brandId,
        credentialId,
        // Token repair has to find the row even after a failed refresh
        // flipped `isConnected` off.
        isDisconnectedIncluded: true,
        organizationId,
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
  async listPublishVerificationPage(
    context: PublishContext,
    _startedAt: Date,
    cursor?: string,
  ): Promise<ProviderVerificationPage> {
    const credential = await this.credentialsService.resolveBrandAccount({
      organizationId: context.organizationId,
      brandId: context.brandId,
      credentialId: context.credential.id,
      platform: CredentialPlatform.MASTODON,
    });
    const instance =
      readChannelSettingString(context.settings, 'instanceUrl') ??
      credential?.description;
    if (
      !credential?.accessToken ||
      !credential.externalId ||
      credential.externalId !== context.credential.externalId ||
      !instance
    )
      throw new Error('Mastodon verification account unavailable or changed');
    const normalized = this.normalizeInstanceUrl(instance);
    const url = new URL(normalized);
    if (url.username || url.password || url.search || url.hash)
      throw new Error('Unsafe Mastodon instance identity');
    const agent = await createSafeWebhookHttpsAgent(normalized);
    const headers = {
      Authorization: `Bearer ${EncryptionUtil.decrypt(credential.accessToken)}`,
    };
    try {
      const account = await firstValueFrom(
        this.httpService.get<{ id?: string }>(
          `${normalized}/api/v1/accounts/verify_credentials`,
          {
            headers,
            httpsAgent: agent,
            maxRedirects: 0,
            timeout: PROVIDER_VERIFICATION_REQUEST_TIMEOUT_MS,
          },
        ),
      );
      if (account.data.id !== credential.externalId)
        throw new Error('Mastodon token/instance account mismatch');
      const endpoint = `${normalized}/api/v1/accounts/${encodeURIComponent(credential.externalId)}/statuses`;
      const result = await firstValueFrom(
        this.httpService.get<unknown>(endpoint, {
          headers,
          httpsAgent: agent,
          maxRedirects: 0,
          timeout: PROVIDER_VERIFICATION_REQUEST_TIMEOUT_MS,
          params: { limit: 40, ...(cursor ? { max_id: cursor } : {}) },
        }),
      );
      return parseMastodonVerificationPage(
        result.data,
        credential.externalId,
        result.headers?.link,
        endpoint,
      );
    } finally {
      agent.destroy();
    }
  }

  public async verifyCredentials(
    instanceUrl: string,
    accessToken: string,
  ): Promise<MastodonAccount> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const normalizedUrl = this.normalizeInstanceUrl(instanceUrl);
    const httpsAgent = await createSafeWebhookHttpsAgent(normalizedUrl);

    try {
      const response = await firstValueFrom(
        this.httpService.get<MastodonAccount>(
          `${normalizedUrl}/api/v1/accounts/verify_credentials`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            httpsAgent,
            maxRedirects: 0,
            timeout: MASTODON_REQUEST_TIMEOUT_MS,
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
    } finally {
      httpsAgent.destroy();
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
    const httpsAgent = await createSafeWebhookHttpsAgent(normalizedUrl);

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
            httpsAgent,
            maxRedirects: 0,
            timeout: MASTODON_REQUEST_TIMEOUT_MS,
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
    } finally {
      httpsAgent.destroy();
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
    let httpsAgent: HttpsAgent | undefined;

    try {
      const media = await this.downloadMedia(mediaUrl);
      const form = new FormData();
      form.append('file', media.buffer, {
        contentType: media.contentType,
        filename: 'media',
      });

      if (description) {
        form.append('description', description);
      }

      httpsAgent = await createSafeWebhookHttpsAgent(normalizedUrl);
      const response = await firstValueFrom(
        this.httpService.post<MastodonMediaAttachment>(
          `${normalizedUrl}/api/v2/media`,
          form,
          {
            httpsAgent,
            maxRedirects: 0,
            timeout: MASTODON_REQUEST_TIMEOUT_MS,
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
    } finally {
      httpsAgent?.destroy();
    }
  }

  private async downloadMedia(
    mediaUrl: string,
  ): Promise<MastodonMediaDownload> {
    const configuredOrigin = new URL(this.configService.cdnUrl).origin;
    const isConfiguredMedia = new URL(mediaUrl).origin === configuredOrigin;
    const response = await safeFetch(
      mediaUrl,
      { signal: AbortSignal.timeout(MASTODON_REQUEST_TIMEOUT_MS) },
      {
        ...(isConfiguredMedia
          ? { allowedOrigins: [configuredOrigin], allowPrivateNetwork: true }
          : {}),
        maxRedirects: 0,
      },
    );
    if (
      !response.ok ||
      !response.body ||
      Number(response.headers.get('content-length')) > MAX_FILE_SIZE
    ) {
      await response.body?.cancel();
      throw new BadRequestException(
        'Mastodon media could not be downloaded within the 100 MB limit',
      );
    }
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_FILE_SIZE) {
          throw new BadRequestException(
            'Mastodon media exceeds the 100 MB limit',
          );
        }
        chunks.push(Buffer.from(chunk.value));
      }
    } finally {
      try {
        await reader.cancel();
      } finally {
        reader.releaseLock();
      }
    }
    return {
      buffer: Buffer.concat(chunks),
      contentType:
        response.headers.get('content-type') || 'application/octet-stream',
    };
  }

  /**
   * Get media analytics for a Mastodon status
   */
  public async getMediaAnalytics(
    organizationId: string,
    brandId: string,
    externalId: string,
    credentialId?: string,
  ): Promise<{
    views: number;
    likes: number;
    comments: number;
    boosts: number;
  }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    let httpsAgent: HttpsAgent | undefined;

    try {
      const credential = await this.credentialsService.resolveBrandAccount({
        brandId,
        credentialId,
        organizationId,
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
      httpsAgent = await createSafeWebhookHttpsAgent(normalizedUrl);

      const response = await firstValueFrom(
        this.httpService.get<
          MastodonStatus & {
            favourites_count: number;
            reblogs_count: number;
            replies_count: number;
          }
        >(`${normalizedUrl}/api/v1/statuses/${externalId}`, {
          headers: { Authorization: `Bearer ${decryptedAccessToken}` },
          httpsAgent,
          maxRedirects: 0,
          timeout: MASTODON_REQUEST_TIMEOUT_MS,
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
    } finally {
      httpsAgent?.destroy();
    }
  }
}
