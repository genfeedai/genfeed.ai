import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import {
  CredentialsService,
  extractReconnectCredentialIdFromState,
} from '@api/collections/credentials/services/credentials.service';
import { SocialSourceHistoryImportService } from '@api/collections/social-sources/services/social-source-history-import.service';

import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnBadRequest,
  returnInternalServerError,
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { InstagramAuthorizedSignalsService } from '@api/services/integrations/instagram/services/instagram-authorized-signals.service';
import {
  getSafeInstagramOAuthErrorLog,
  throwMappedInstagramOAuthError,
} from '@api/services/integrations/instagram/utils/instagram-error.util';
import { isUnconfiguredSecret } from '@genfeedai/config';
import { CredentialPlatform, OAuthGrantType } from '@genfeedai/contracts';
import { buildGrantedScopesCredentialPatch } from '@genfeedai/helpers';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { AxiosResponse } from 'axios';
import type { Request } from 'express';
import { firstValueFrom } from 'rxjs';

interface InstagramShortLivedTokenResponse {
  access_token: string;
  expires_in?: number;
  scope?: string;
}

interface InstagramLongLivedTokenResponse {
  access_token: string;
  expires_in?: number;
  scope?: string;
}

@AutoSwagger()
@Controller('services/instagram')
export class InstagramController {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly redirectUri: string;

  private readonly graphUrl: string = 'https://graph.facebook.com';
  private readonly apiVersion: string;
  private readonly scope = [
    'business_management',
    'instagram_basic',
    'pages_show_list',
    'pages_read_engagement',
    'instagram_content_publish',
    'instagram_manage_insights',
    'pages_manage_posts',
    'public_profile',
    'ads_management',
  ];

  constructor(
    private readonly configService: ConfigService,

    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly instagramService: InstagramService,
    private readonly instagramAuthorizedSignalsService: InstagramAuthorizedSignalsService,
    private readonly historyImportService: SocialSourceHistoryImportService,
    private readonly loggerService: LoggerService,
  ) {
    this.redirectUri = this.configService.get('INSTAGRAM_REDIRECT_URI') ?? '';
    this.apiVersion =
      this.configService.get('INSTAGRAM_API_VERSION') || 'v24.0';
  }

  /**
   * Step 1: Get Instagram OAuth URL for user to connect their brand.
   * This will allow us to request permissions to publish on their behalf.
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createCredentialDto: ConnectCredentialDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(url, createCredentialDto);

    const brand = await this.brandsService.findOne({
      id: createCredentialDto.brandId,
      organizationId: user.organizationId,
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    let reconnectCredentialId: string | undefined;
    if (createCredentialDto.credentialId) {
      const reconnectTarget = await this.credentialsService.resolveBrandAccount(
        {
          brandId: brand.id.toString(),
          credentialId: createCredentialDto.credentialId,
          isDisconnectedIncluded: true,
          organizationId: user.organizationId,
          platform: CredentialPlatform.INSTAGRAM,
        },
      );

      if (!reconnectTarget) {
        return returnBadRequest({
          detail: 'The credential to reconnect does not belong to this brand',
          title: 'Invalid payload',
        });
      }

      reconnectCredentialId = reconnectTarget.id.toString();
    }

    const appId = this.configService.get('INSTAGRAM_APP_ID');

    const redirectUri =
      this.configService.get('INSTAGRAM_REDIRECT_URI') ?? this.redirectUri;
    if (
      !appId ||
      !redirectUri ||
      isUnconfiguredSecret(appId) ||
      isUnconfiguredSecret(redirectUri)
    ) {
      throw new ServiceUnavailableException(
        'Instagram OAuth is not configured for this deployment.',
      );
    }

    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      user.userId ?? user.id,
      CredentialPlatform.INSTAGRAM,
      {
        accessToken: undefined,
        isConnected: false,
        oauthToken: undefined,
        oauthTokenSecret: undefined,
      },
      reconnectCredentialId,
    );

    this.loggerService.log(`${url} - Generating OAuth URL`, {
      appId: 'configured',
      redirectUri,
    });

    // Facebook/Instagram OAuth endpoint
    const authUrl =
      `https://www.facebook.com/${this.apiVersion}/dialog/oauth?client_id=${appId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(this.scope.join(','))}` +
      `&response_type=code&state=${encodeURIComponent(state)}`;

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: authUrl,
    });
  }

  /**
   * Step 2: Handle the OAuth callback, exchange code for a long-lived access token,
   * and save it to the database. The user will select their Instagram brand later.
   */
  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() createCredentialVerifyDto: Partial<CreateCredentialVerifyDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, {
      hasCode: Boolean(createCredentialVerifyDto.code),
      hasState: Boolean(createCredentialVerifyDto.state),
    });
    let failureStage = 'request_validation';

    try {
      const { code, state } = createCredentialVerifyDto;

      if (!code || !state) {
        return returnBadRequest({
          detail: 'Missing code or identifiers',
          title: 'Invalid payload',
        });
      }

      failureStage = 'credential_lookup';
      const existingCredential =
        await this.credentialsService.findPendingOAuthCredential(
          state,
          CredentialPlatform.INSTAGRAM,
        );

      if (!existingCredential) {
        return returnNotFound(
          'Pending OAuth credential',
          'for this OAuth state',
        );
      }

      failureStage = 'configuration';
      const appId = this.configService.get('INSTAGRAM_APP_ID');
      const appSecret = this.configService.get('INSTAGRAM_APP_SECRET');

      if (
        !appId ||
        !appSecret ||
        isUnconfiguredSecret(appId) ||
        isUnconfiguredSecret(appSecret)
      ) {
        throw new ServiceUnavailableException(
          'Instagram OAuth is not configured for this deployment.',
        );
      }

      failureStage = 'short_lived_token';
      const tokenRes: AxiosResponse<InstagramShortLivedTokenResponse> =
        await firstValueFrom(
          this.httpService.post(
            `${this.graphUrl}/${this.apiVersion}/oauth/access_token`,
            null,
            {
              params: {
                client_id: appId,
                client_secret: appSecret,
                code,
                redirect_uri: this.redirectUri,
              },
            },
          ),
        );

      const shortLivedToken = tokenRes.data.access_token;

      this.loggerService.log(`${url} - Short-lived token obtained`, {
        expiresIn: tokenRes.data.expires_in,
        hasToken: !!shortLivedToken,
      });

      if (!shortLivedToken) {
        return returnBadRequest({
          detail: 'Missing short-lived access token from Facebook',
          title: 'Invalid payload',
        });
      }

      // 2. Exchange short-lived token for long-lived token
      failureStage = 'long_lived_token';
      const longTokenRes: AxiosResponse<InstagramLongLivedTokenResponse> =
        await firstValueFrom(
          this.httpService.get(
            `${this.graphUrl}/${this.apiVersion}/oauth/access_token`,
            {
              params: {
                client_id: appId,
                client_secret: appSecret,
                fb_exchange_token: shortLivedToken,
                grant_type: OAuthGrantType.FB_EXCHANGE_TOKEN,
              },
            },
          ),
        );

      const { access_token, expires_in } = longTokenRes.data || {};
      const scope = tokenRes.data.scope ?? longTokenRes.data?.scope;

      if (!access_token) {
        return returnBadRequest({
          detail: 'Failed to get long-lived access token',
          title: 'Invalid payload',
        });
      }

      // Persist the exchanged token. Identity is not yet known — a brand may
      // hold several Instagram accounts, and which one was just authorized is
      // decided below — so the row stays unconnected until it is resolved.
      // Reactivate a previously soft-deleted row when reconnecting.
      failureStage = 'credential_persist';
      let credential = await this.credentialsService.patch(
        existingCredential.id,
        {
          accessToken: access_token,
          accessTokenExpiry: expires_in
            ? new Date(Date.now() + expires_in * 1000)
            : undefined,
          isConnected: false,
          isDeleted: false,
          oauthState: null,
          refreshToken: undefined,
          refreshTokenExpiry: undefined,
          ...buildGrantedScopesCredentialPatch(scope),
        },
      );

      failureStage = 'account_resolution';
      const resolution = await this.resolveAuthorizedAccount({
        accessToken: access_token,
        credential,
        organizationId: existingCredential.organizationId,
        reconnectCredentialId: extractReconnectCredentialIdFromState(state),
        url,
      });
      credential = resolution.credential;

      if (resolution.needsSelection) {
        // Token saved, identity ambiguous. The callback page fetches this
        // credential's Instagram pages and lets the operator pick — see
        // `CredentialsController.findAllInstagramPages`.
        return serializeSingle(request, CredentialSerializer, credential);
      }

      failureStage = 'post_connection';
      credential = await this.finalizeConnection({
        accessToken: access_token,
        credential,
        grantedScopes: scope,
        organizationId: existingCredential.organizationId,
        url,
      });

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, {
        stage: failureStage,
        ...getSafeInstagramOAuthErrorLog(error),
      });
      return throwMappedInstagramOAuthError(
        error,
        'Failed to verify Instagram OAuth',
      );
    }
  }

  /**
   * Resolve which Instagram professional account this OAuth grant authorized,
   * and persist it. Unlike avatar/name enrichment this step is never
   * best-effort: an unresolved account is exactly the ambiguity this whole
   * flow exists to remove, so failures and open questions propagate instead
   * of leaving a connected-but-unidentified row.
   *
   * - Zero eligible accounts fails the connection outright.
   * - One eligible account is chosen automatically.
   * - A matching reconnect intent (see `connect`) wins next.
   * - Otherwise, accounts already held by another live credential of this
   *   brand are excluded; if exactly one remains, it is chosen.
   * - Anything still ambiguous is left unresolved for the operator to pick
   *   from `GET /credentials/:id/instagram/pages` (`needsSelection: true`).
   */
  private async resolveAuthorizedAccount(params: {
    accessToken: string;
    credential: Awaited<ReturnType<CredentialsService['patch']>>;
    organizationId: string;
    reconnectCredentialId: string | undefined;
    url: string;
  }): Promise<{
    credential: Awaited<ReturnType<CredentialsService['patch']>>;
    needsSelection: boolean;
  }> {
    const {
      accessToken,
      credential,
      organizationId,
      reconnectCredentialId,
      url,
    } = params;
    const brandId = credential.brandId ?? undefined;

    const accounts =
      await this.instagramService.listAuthorizedInstagramAccounts(accessToken);

    if (accounts.length === 0) {
      throw new HttpException(
        {
          detail:
            'The Instagram account must be a professional account (Business or Creator) linked to a Facebook Page you manage. Please connect an eligible account and try again.',
          title: 'Instagram account not eligible',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    let chosen = accounts.length === 1 ? accounts[0] : undefined;

    if (!chosen && reconnectCredentialId && brandId) {
      const reconnectTarget = await this.credentialsService.resolveBrandAccount(
        {
          brandId,
          credentialId: reconnectCredentialId,
          isDisconnectedIncluded: true,
          organizationId,
          platform: CredentialPlatform.INSTAGRAM,
        },
      );

      if (reconnectTarget?.externalId) {
        chosen = accounts.find(
          (account) => account.id === reconnectTarget.externalId,
        );
      }
    }

    if (!chosen && accounts.length > 1 && brandId) {
      const heldAccounts = await this.credentialsService.findConnectedAccounts(
        organizationId,
        brandId,
        CredentialPlatform.INSTAGRAM,
      );
      const heldExternalIds = new Set(
        heldAccounts
          .filter((account) => account.id !== credential.id)
          .map((account) => account.externalId)
          .filter((externalId): externalId is string => Boolean(externalId)),
      );
      const remaining = accounts.filter(
        (account) => !heldExternalIds.has(account.id),
      );

      if (remaining.length === 1) {
        chosen = remaining[0];
      }
    }

    if (!chosen) {
      this.loggerService.log(`${url} - Instagram account selection required`, {
        candidateCount: accounts.length,
        credentialId: credential.id,
      });
      return { credential, needsSelection: true };
    }

    const updated = await this.credentialsService.updateExternalProfile(
      credential.id.toString(),
      organizationId,
      {
        avatarUrl: chosen.image,
        handle: chosen.username,
        id: chosen.id,
        name: chosen.label || chosen.username,
      },
    );

    return { credential: updated, needsSelection: false };
  }

  /**
   * Post-connection work that must never fail the connection itself: refresh
   * the authorized signals snapshot, then queue the import of the account's
   * existing posts. Both are best-effort and logged on failure.
   */
  private async finalizeConnection(params: {
    accessToken: string;
    credential: Awaited<ReturnType<CredentialsService['patch']>>;
    grantedScopes: string | undefined;
    organizationId: string;
    url: string;
  }): Promise<Awaited<ReturnType<CredentialsService['patch']>>> {
    const { accessToken, grantedScopes, organizationId, url } = params;
    let credential = params.credential;
    try {
      await this.instagramAuthorizedSignalsService.refresh({
        accessToken,
        credentialId: credential.id.toString(),
        force: true,
        grantedScopes,
        organizationId,
      });
      credential =
        (await this.credentialsService.findOne({
          id: credential.id.toString(),
          organizationId,
          platform: CredentialPlatform.INSTAGRAM,
        })) ?? credential;
    } catch (signalError: unknown) {
      this.loggerService.warn(
        `${url} authorized signal refresh failed after connection`,
        getSafeInstagramOAuthErrorLog(signalError),
      );
    }
    try {
      await this.historyImportService.scheduleForCredential({
        credentialId: credential.id.toString(),
        organizationId,
      });
    } catch (scheduleError: unknown) {
      this.loggerService.warn(
        `${url} history import scheduling failed after connection`,
        getSafeInstagramOAuthErrorLog(scheduleError),
      );
    }
    return credential;
  }

  @Post(':credentialId/authorized-signals/refresh')
  async refreshAuthorizedSignals(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
  ) {
    await this.instagramAuthorizedSignalsService.refresh({
      credentialId,
      organizationId: user.organizationId,
    });

    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
      platform: CredentialPlatform.INSTAGRAM,
    });

    if (!credential) {
      return returnNotFound('Instagram credential', credentialId);
    }

    return serializeSingle(request, CredentialSerializer, credential);
  }

  @Get('trends')
  getTrends() {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url);

    try {
      return this.instagramService.getTrends();
    } catch (error) {
      this.loggerService.error(`${url} failed`, error);
      return returnInternalServerError('Failed to fetch Instagram trends');
    }
  }
}
