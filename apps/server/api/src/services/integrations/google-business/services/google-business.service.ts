import type {
  CredentialDocument,
  CredentialPatch,
} from '@api/collections/credentials/credential.types';
import {
  SERVER_TOKENS,
  type ServerCredentialStore,
} from '@api/server.dependencies';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import {
  GOOGLE_BUSINESS_ACCOUNTS_URL,
  GOOGLE_BUSINESS_INFORMATION_URL,
  GOOGLE_BUSINESS_POSTS_URL,
  GOOGLE_BUSINESS_REDIRECT_PATH,
  GOOGLE_BUSINESS_REQUEST_TIMEOUT_MS,
  GOOGLE_BUSINESS_SCOPE,
  GOOGLE_BUSINESS_TOKEN_REFRESH_BUFFER_MS,
} from '@api/services/integrations/google-business/google-business.constants';
import {
  GoogleBusinessApiError,
  isGoogleBusinessGrantRevokedError,
  toGoogleBusinessApiError,
} from '@api/services/integrations/google-business/google-business-error.util';
import type {
  GoogleBusinessLocalPost,
  GoogleBusinessLocalPostInput,
  GoogleBusinessLocation,
} from '@api/services/integrations/google-business/interfaces/google-business.interface';
import type { AlertEmailNotificationPayload } from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import {
  ActivityKey,
  ActivitySource,
  CredentialPlatform,
} from '@genfeedai/contracts';
import { buildGrantedScopesCredentialPatch } from '@genfeedai/helpers';
import { isRecord, readString } from '@genfeedai/utils/data/extract.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { firstValueFrom } from 'rxjs';

const TRAILING_SLASHES_PATTERN = /\/+$/;
const ACCOUNT_PAGE_SIZE = 20;
const LOCATION_PAGE_SIZE = 100;
/** A hard stop so a provider that never ends a listing cannot hold a request. */
const MAX_LISTING_PAGES = 10;

export interface GoogleBusinessTokens {
  accessToken: string;
  accessTokenExpiry?: Date;
  refreshToken?: string;
  scope?: string;
}

@Traced()
@Injectable()
export class GoogleBusinessService {
  private readonly refreshesInFlight = new Map<
    string,
    Promise<CredentialDocument>
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly httpService: HttpService,
    private readonly activityRecorder: ActivityRecorderService,
    @Inject(SERVER_TOKENS.credentials)
    private readonly credentialsService: ServerCredentialStore,
  ) {}

  /** `<app URL>/oauth/google-business`; must be an authorized redirect URI of the Google client. */
  getRedirectUri(): string {
    const appUrl = this.configService.get('GENFEEDAI_APP_URL');
    if (!appUrl) {
      throw new Error('GENFEEDAI_APP_URL is required for Google OAuth');
    }
    return `${appUrl.replace(TRAILING_SLASHES_PATTERN, '')}${GOOGLE_BUSINESS_REDIRECT_PATH}`;
  }

  generateAuthUrl(state: string): string {
    return this.createOAuthClient().generateAuthUrl({
      access_type: 'offline',
      include_granted_scopes: false,
      // consent forces a refresh token even when the account approved before.
      // select_account lets the owner choose the Google account that manages
      // the business, which is often not the one signed in to the browser.
      prompt: 'consent select_account',
      scope: [GOOGLE_BUSINESS_SCOPE],
      state,
    });
  }

  async exchangeCodeForTokens(code: string): Promise<GoogleBusinessTokens> {
    const { tokens } = await this.createOAuthClient().getToken(code);
    if (!tokens.access_token) {
      throw new Error('Google did not return an access token');
    }
    return {
      accessToken: tokens.access_token,
      accessTokenExpiry: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : undefined,
      refreshToken: tokens.refresh_token ?? undefined,
      scope: tokens.scope,
    };
  }

  /**
   * Every location the Google account can post to, across its accounts.
   * Accounts and locations are different APIs on different hosts.
   */
  async listLocations(accessToken: string): Promise<GoogleBusinessLocation[]> {
    const locations: GoogleBusinessLocation[] = [];
    let accountToken: string | undefined;

    for (let page = 0; page < MAX_LISTING_PAGES; page++) {
      const accounts = await this.getJson(
        accessToken,
        GOOGLE_BUSINESS_ACCOUNTS_URL,
        { pageSize: ACCOUNT_PAGE_SIZE, pageToken: accountToken },
        'account listing',
      );
      for (const account of readArray(accounts.accounts)) {
        const accountName = readString(account.name);
        if (accountName) {
          locations.push(
            ...(await this.listAccountLocations(accessToken, accountName)),
          );
        }
      }
      accountToken = readString(accounts.nextPageToken);
      if (!accountToken) {
        break;
      }
    }

    return locations;
  }

  private async listAccountLocations(
    accessToken: string,
    accountName: string,
  ): Promise<GoogleBusinessLocation[]> {
    const locations: GoogleBusinessLocation[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_LISTING_PAGES; page++) {
      const body = await this.getJson(
        accessToken,
        `${GOOGLE_BUSINESS_INFORMATION_URL}/${accountName}/locations`,
        {
          pageSize: LOCATION_PAGE_SIZE,
          pageToken,
          // Required by the API: nothing is returned without a mask.
          readMask: 'name,title,storefrontAddress',
        },
        'location listing',
      );

      for (const location of readArray(body.locations)) {
        const name = readString(location.name);
        const title = readString(location.title);
        // Business Information names a location `locations/{id}`; the posts API
        // needs it under its account.
        if (name && title) {
          locations.push({
            address: formatAddress(location.storefrontAddress),
            id: `${accountName}/${name}`,
            title,
          });
        }
      }

      pageToken = readString(body.nextPageToken);
      if (!pageToken) {
        break;
      }
    }

    return locations;
  }

  /** Create a standard update on a location. Google may park it in PROCESSING. */
  async createLocalPost(
    credential: CredentialDocument,
    locationName: string,
    post: GoogleBusinessLocalPostInput,
  ): Promise<GoogleBusinessLocalPost> {
    const body = await this.withFreshToken(credential, (accessToken) =>
      this.requestJson(
        accessToken,
        'POST',
        `${GOOGLE_BUSINESS_POSTS_URL}/${locationName}/localPosts`,
        { data: post },
        'post creation',
      ),
    );
    const name = readString(body.name);
    if (!name) {
      throw new Error('Google Business Profile returned a post with no name');
    }
    return {
      createTime: readString(body.createTime),
      media: readArray(body.media),
      name,
      searchUrl: readString(body.searchUrl),
      state: readString(body.state) as GoogleBusinessLocalPost['state'],
      summary: readString(body.summary),
      topicType: readString(body.topicType),
    };
  }

  /** One page of a location's posts, newest first. */
  async listLocalPosts(
    credential: CredentialDocument,
    locationName: string,
    pageToken?: string,
  ): Promise<{
    nextPageToken: string | null;
    posts: GoogleBusinessLocalPost[];
  }> {
    const body = await this.withFreshToken(credential, (accessToken) =>
      this.getJson(
        accessToken,
        `${GOOGLE_BUSINESS_POSTS_URL}/${locationName}/localPosts`,
        { pageSize: 20, pageToken },
        'post listing',
      ),
    );
    return {
      nextPageToken: readString(body.nextPageToken) ?? null,
      posts: readArray(body.localPosts).flatMap((post) => {
        const name = readString(post.name);
        return name
          ? [
              {
                createTime: readString(post.createTime),
                media: readArray(post.media),
                name,
                searchUrl: readString(post.searchUrl),
                state: readString(
                  post.state,
                ) as GoogleBusinessLocalPost['state'],
                summary: readString(post.summary),
                topicType: readString(post.topicType),
              },
            ]
          : [];
      }),
    };
  }

  /**
   * Renew the access token of one credential. Only an `invalid_grant` answer
   * disconnects it; a network error or a 5xx keeps it connected so the next
   * run retries.
   */
  async refreshToken(
    organizationId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<CredentialDocument> {
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId,
      credentialId,
      isDisconnectedIncluded: true,
      organizationId,
      platform: CredentialPlatform.GOOGLE_BUSINESS,
    });
    if (!credential) {
      throw new Error('Google Business credential not found');
    }
    return this.refreshCredential(credential);
  }

  private refreshCredential(
    credential: CredentialDocument,
  ): Promise<CredentialDocument> {
    const inFlight = this.refreshesInFlight.get(credential.id);
    if (inFlight) {
      return inFlight;
    }
    const refresh = this.refreshLoadedCredential(credential).finally(() => {
      this.refreshesInFlight.delete(credential.id);
    });
    this.refreshesInFlight.set(credential.id, refresh);
    return refresh;
  }

  private async refreshLoadedCredential(
    credential: CredentialDocument,
  ): Promise<CredentialDocument> {
    if (!credential.refreshToken) {
      const error = new Error(
        'Google Business refresh token not found. Please reconnect the location.',
      );
      await this.markDisconnected(credential, error);
      throw error;
    }

    try {
      const client = this.createOAuthClient();
      client.setCredentials({
        refresh_token: EncryptionUtil.decrypt(credential.refreshToken),
      });
      const { credentials } = await client.refreshAccessToken();
      if (!credentials.access_token) {
        throw new Error('Google did not return an access token on refresh');
      }

      const patch: CredentialPatch = {
        accessToken: credentials.access_token,
        isConnected: true,
        isDeleted: false,
      };
      if (credentials.refresh_token) {
        patch.refreshToken = credentials.refresh_token;
      }
      if (credentials.expiry_date) {
        patch.accessTokenExpiry = new Date(credentials.expiry_date);
      }
      const scopes = buildGrantedScopesCredentialPatch(credentials.scope);
      if (scopes) {
        Object.assign(patch, scopes);
      }
      return await this.credentialsService.patch(credential.id, patch);
    } catch (error: unknown) {
      this.loggerService.error('Google Business token refresh failed', {
        credentialId: credential.id,
        error: error instanceof Error ? error.message : String(error),
      });
      if (isGoogleBusinessGrantRevokedError(error)) {
        await this.markDisconnected(credential, error);
      }
      throw error;
    }
  }

  /** Disconnect a channel whose grant Google revoked, once, and alert its owner. */
  async markDisconnected(
    credential: CredentialDocument,
    error: unknown,
  ): Promise<void> {
    if (credential.isConnected === false) {
      return;
    }
    await this.credentialsService.patch(credential.id, { isConnected: false });

    const reason = error instanceof Error ? error.message : 'Access revoked';
    const label =
      credential.externalName ??
      credential.externalHandle ??
      'Google Business Profile';
    const alertPayload: AlertEmailNotificationPayload = {
      event: 'channel_disconnected',
      kind: 'alert_email',
      label,
      summary: `Google no longer allows Genfeed to post to this location (${reason}). Posts scheduled on it will fail until you reconnect it.`,
      version: 1,
    };

    if (!credential.brandId || !credential.organizationId) {
      return;
    }
    await this.activityRecorder.record({
      alert: { payload: alertPayload },
      brandId: credential.brandId,
      key: ActivityKey.SOCIAL_INTEGRATION_DISCONNECTED,
      organizationId: credential.organizationId,
      source: ActivitySource.SOCIAL_INTEGRATION,
      userId: credential.userId ?? undefined,
      value: `Google Business Profile integration disconnected: ${reason}`,
    });
  }

  /**
   * Run a call with a usable access token. The token is renewed ahead of
   * expiry, and once more when Google refuses it anyway.
   */
  private async withFreshToken<T>(
    credential: CredentialDocument,
    run: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    let current = credential;
    if (this.isTokenStale(current)) {
      current = await this.refreshCredential(current);
    }
    if (!current.accessToken) {
      throw new Error('Google Business credential has no access token');
    }

    try {
      return await run(EncryptionUtil.decrypt(current.accessToken));
    } catch (error: unknown) {
      if (
        !(error instanceof GoogleBusinessApiError) ||
        !error.isTokenRejected
      ) {
        throw error;
      }
      current = await this.refreshCredential(current);
      if (!current.accessToken) {
        throw error;
      }
      return run(EncryptionUtil.decrypt(current.accessToken));
    }
  }

  private isTokenStale(credential: CredentialDocument): boolean {
    if (!credential.accessToken) {
      return true;
    }
    if (!credential.accessTokenExpiry) {
      return false;
    }
    return (
      new Date(credential.accessTokenExpiry).getTime() <=
      Date.now() + GOOGLE_BUSINESS_TOKEN_REFRESH_BUFFER_MS
    );
  }

  private getJson(
    accessToken: string,
    url: string,
    params: Record<string, string | number | undefined>,
    action: string,
  ): Promise<Record<string, unknown>> {
    return this.requestJson(accessToken, 'GET', url, { params }, action);
  }

  private async requestJson(
    accessToken: string,
    method: 'GET' | 'POST',
    url: string,
    options: {
      data?: unknown;
      params?: Record<string, string | number | undefined>;
    },
    action: string,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await firstValueFrom(
        this.httpService.request<unknown>({
          data: options.data,
          headers: { Authorization: `Bearer ${accessToken}` },
          maxRedirects: 0,
          method,
          params: options.params,
          timeout: GOOGLE_BUSINESS_REQUEST_TIMEOUT_MS,
          url,
        }),
      );
      return isRecord(response.data) ? response.data : {};
    } catch (error: unknown) {
      throw toGoogleBusinessApiError(error, action);
    }
  }

  private createOAuthClient(): OAuth2Client {
    return new OAuth2Client(
      this.requireConfig('GOOGLE_OAUTH_CLIENT_ID'),
      this.requireConfig('GOOGLE_OAUTH_CLIENT_SECRET'),
      this.getRedirectUri(),
    );
  }

  private requireConfig(
    key: 'GOOGLE_OAUTH_CLIENT_ID' | 'GOOGLE_OAUTH_CLIENT_SECRET',
  ): string {
    const value = this.configService.get<string>(key);
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`${key} is not configured`);
    }
    return value;
  }
}

function readArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function formatAddress(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const lines = Array.isArray(value.addressLines)
    ? value.addressLines.filter(
        (line): line is string => typeof line === 'string',
      )
    : [];
  const parts = [
    ...lines.slice(0, 1),
    readString(value.locality),
    readString(value.regionCode),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(', ') : undefined;
}
