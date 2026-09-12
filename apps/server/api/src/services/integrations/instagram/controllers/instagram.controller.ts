import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import {
  CredentialsService,
  extractReconnectCredentialIdFromWarmupSignals,
} from '@api/collections/credentials/services/credentials.service';

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
import { InstagramConnectionResolverService } from '@api/services/integrations/instagram/services/instagram-connection-resolver.service';
import {
  getSafeInstagramOAuthErrorLog,
  throwMappedInstagramOAuthError,
} from '@api/services/integrations/instagram/utils/instagram-error.util';
import { isUnconfiguredSecret } from '@genfeedai/config';
import { CredentialPlatform } from '@genfeedai/contracts';
import { buildGrantedScopesCredentialPatch } from '@genfeedai/helpers';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';

import type { Request } from 'express';

@AutoSwagger()
@Controller('services/instagram')
export class InstagramController {
  private readonly constructorName: string = String(this.constructor.name);

  private readonly redirectUri: string;

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
    private readonly instagramService: InstagramService,
    private readonly instagramAuthorizedSignalsService: InstagramAuthorizedSignalsService,
    private readonly connectionResolver: InstagramConnectionResolverService,
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
   *
   * The Facebook API exchange, account discovery, account-resolution decision
   * tree, and post-connection persistence steps live on
   * `InstagramConnectionResolverService` — this method is the request/response
   * shell plus the failure-stage bookkeeping for observability.
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

      const {
        accessToken: access_token,
        accounts,
        expiresIn: expires_in,
        scope,
      } = await this.connectionResolver.exchangeAndDiscoverAccounts({
        appId,
        appSecret,
        code,
        markStage: (stage) => {
          failureStage = stage;
        },
      });

      // Persist the exchanged token now that at least one eligible account
      // is known to exist. Identity may still be ambiguous — decided below
      // — so the row stays unconnected until it is resolved. Reactivate a
      // previously soft-deleted row when reconnecting.
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
      const resolution = await this.connectionResolver.resolveAuthorizedAccount(
        {
          accounts,
          credential,
          organizationId: existingCredential.organizationId,
          reconnectCredentialId: extractReconnectCredentialIdFromWarmupSignals(
            existingCredential.warmupSignals,
          ),
          url,
        },
      );
      credential = resolution.credential;

      if (resolution.needsSelection) {
        // Token saved, identity ambiguous. `needsAccountSelection` on the
        // serialized credential (computed in the serializer, not inferred
        // by the caller) tells the callback page to fetch this credential's
        // Instagram pages and let the operator pick — see
        // `CredentialsController.findAllInstagramPages` and
        // `InstagramController.selectAccount`.
        return serializeSingle(request, CredentialSerializer, credential);
      }

      failureStage = 'post_connection';
      credential = await this.connectionResolver.finalizeConnection({
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
   * Step 3 (only when verify reported `needsAccountSelection`): the operator
   * has picked one of the candidates from `GET
   * /credentials/:credentialId/instagram/pages`. Handle/name/avatar are read
   * from this endpoint's own re-fetch of the credential's authorized
   * accounts — never trusted from the request body — so a client cannot
   * claim an externalId the token does not actually authorize, and cannot
   * repoint this credential onto an account it was never granted.
   */
  @Post(':credentialId/select-account')
  async selectAccount(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
    @Body() body: { externalId?: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!body?.externalId) {
      return returnBadRequest({
        detail: 'externalId is required',
        title: 'Invalid payload',
      });
    }

    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
      platform: CredentialPlatform.INSTAGRAM,
    });

    if (!credential || credential.isDeleted) {
      return returnNotFound('Instagram credential', credentialId);
    }

    if (!credential.accessToken) {
      return returnBadRequest({
        detail: 'Instagram account is not connected',
        title: 'Not Connected',
      });
    }

    // This endpoint exists to settle exactly one ambiguity: a token was
    // exchanged but never resolved to a specific account (see
    // `computeNeedsAccountSelection`). A credential that is already
    // connected, or already carries an externalId, is not in that state —
    // without this check, any caller who knows a live credential's id could
    // silently repoint it onto a different account the same token happens
    // to authorize, entirely outside the disconnect/reconnect flow an
    // operator would actually use to change which account a credential
    // represents.
    if (credential.isConnected || credential.externalId) {
      return returnBadRequest({
        detail:
          'This credential is already connected to an account. Disconnect and reconnect to choose a different one.',
        title: 'Already Connected',
      });
    }

    try {
      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const accounts =
        await this.instagramService.listAuthorizedInstagramAccounts(
          accessToken,
        );
      const chosen = accounts.find((account) => account.id === body.externalId);

      if (!chosen) {
        return returnBadRequest({
          detail:
            'That account is not authorized by this connection. Reconnect Instagram and try again.',
          title: 'Account not available',
        });
      }

      let updated = await this.credentialsService.updateExternalProfile(
        credential.id.toString(),
        user.organizationId,
        {
          avatarUrl: chosen.image,
          handle: chosen.username ?? null,
          id: chosen.id,
          name: chosen.label || chosen.username,
        },
      );

      updated = await this.connectionResolver.finalizeConnection({
        accessToken,
        credential: updated,
        // Undefined so `finalizeConnection`'s signal refresh falls back to
        // this credential's already-persisted grantedScopes, the same as
        // any other post-connection refresh.
        grantedScopes: undefined,
        organizationId: user.organizationId,
        url,
      });

      return serializeSingle(request, CredentialSerializer, updated);
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        getSafeInstagramOAuthErrorLog(error),
      );
      return throwMappedInstagramOAuthError(
        error,
        'Failed to connect the selected Instagram account',
      );
    }
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
