import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { throwIfOAuthCallbackError } from '@api/collections/credentials/utils/oauth-callback-error.util';
import { claimOAuthVerifyCredential } from '@api/collections/credentials/utils/oauth-verify-claim.util';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { serializeSingle } from '@api/helpers/utils/response/response.util';
import { BlueskyService } from '@api/services/integrations/bluesky/services/bluesky.service';
import { BlueskyOAuthService } from '@api/services/integrations/bluesky/services/bluesky-oauth.service';
import { BLUESKY_DEFAULT_SERVICE_URL } from '@api/services/integrations/bluesky/utils/bluesky-service-url.util';
import type { NodeSavedState } from '@atproto/oauth-client-node';
import { CredentialPlatform } from '@genfeedai/contracts';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { Public } from '@libs/decorators/public.decorator';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  Body,
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/bluesky')
export class BlueskyController {
  constructor(
    private readonly blueskyService: BlueskyService,
    private readonly oauthService: BlueskyOAuthService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * The document Bluesky fetches at this client's id to learn who is asking:
   * its name, redirect address, scope and public key. It must be public and
   * answer 200 with JSON, with no redirect.
   * GET /services/bluesky/client-metadata.json
   */
  @Public()
  @Get('client-metadata.json')
  @Header('Cache-Control', 'public, max-age=300')
  async clientMetadata() {
    return this.oauthService.getClientMetadata();
  }

  /**
   * Start signing in to Bluesky. Returns the Bluesky page where the person
   * approves access; Genfeed never sees a Bluesky password.
   * POST /services/bluesky/connect
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: ConnectCredentialDto,
  ) {
    const brand = await this.brandsService.findOne({
      id: body.brandId,
      organizationId: user.organizationId,
    });
    if (!brand) {
      throw new HttpException(
        {
          detail: 'You do not have access to this brand',
          title: 'Invalid payload',
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // A reconnect names the account, so Bluesky opens on it. A new connection
    // starts at the Bluesky-hosted sign-in.
    const existing = body.credentialId
      ? await this.credentialsService.findOne({
          brandId: body.brandId,
          id: body.credentialId,
          isDeleted: false,
          organizationId: user.organizationId,
          platform: CredentialPlatform.BLUESKY,
        })
      : null;

    try {
      const attempt = await this.oauthService.beginAuthorization(
        existing?.externalId ?? BLUESKY_DEFAULT_SERVICE_URL,
      );
      const { credential } = await this.credentialsService.beginOAuthForBrand(
        brand,
        user.userId ?? user.id,
        CredentialPlatform.BLUESKY,
        {
          isConnected: false,
          oauthTokenSecret: JSON.stringify(attempt.savedState),
        },
        existing?.id,
      );
      // The state in the Bluesky address is the one the callback returns, so
      // it is how the pending credential is found again.
      await this.credentialsService.patch(credential.id, {
        oauthState: attempt.state,
      });
      return serializeSingle(request, CredentialOAuthSerializer, {
        url: attempt.authorizationUrl,
      });
    } catch (error: unknown) {
      this.loggerService.error('BlueskyController connect failed', error);
      throw new HttpException(
        {
          detail: 'Failed to start the Bluesky sign-in',
          title: 'Connection Error',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Finish signing in after Bluesky sent the person back with a code.
   * POST /services/bluesky/verify
   */
  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() body: Partial<CreateCredentialVerifyDto>,
  ) {
    await throwIfOAuthCallbackError(
      this.credentialsService,
      body,
      CredentialPlatform.BLUESKY,
    );
    if (!body.code || !body.state) {
      throw new HttpException(
        {
          detail: 'Missing required OAuth parameters',
          title: 'Invalid payload',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const claim = await claimOAuthVerifyCredential(
      this.credentialsService,
      body.state,
      CredentialPlatform.BLUESKY,
    );
    if (claim?.alreadyConnected) {
      return serializeSingle(request, CredentialSerializer, claim.credential);
    }
    const pending = claim?.credential;
    if (!pending?.oauthTokenSecret || !pending.organizationId) {
      throw new HttpException(
        { detail: 'Bluesky credential not found', title: 'OAuth Error' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const params = new URLSearchParams({ code: body.code, state: body.state });
    if (body.iss) {
      params.set('iss', body.iss);
    }

    let completed: Awaited<
      ReturnType<BlueskyOAuthService['completeAuthorization']>
    >;
    try {
      completed = await this.oauthService.completeAuthorization(
        params,
        JSON.parse(
          EncryptionUtil.decrypt(pending.oauthTokenSecret),
        ) as NodeSavedState,
      );
    } catch (error: unknown) {
      this.loggerService.warn('BlueskyController verify refused', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new HttpException(
        {
          detail: 'Bluesky did not complete this sign-in',
          title: 'OAuth Error',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const profile = await this.blueskyService.getPublicProfile(completed.did);

    // The DID is the account identity: a handle can change, a DID cannot, so
    // reconnecting the same account updates it and a second account is added.
    const credential = await this.credentialsService.connectAccount(
      pending.id,
      pending.organizationId,
      {
        avatarUrl: profile.avatar,
        bannerUrl: profile.banner,
        handle: profile.handle ?? completed.did,
        id: completed.did,
        name: profile.displayName || profile.handle || completed.did,
      },
      {
        accessToken: JSON.stringify(completed.savedSession),
        description: new URL(completed.audience).origin,
        isConnected: true,
        isDeleted: false,
        oauthState: null,
        oauthTokenSecret: null,
      },
    );

    this.loggerService.log('BlueskyController connected', {
      did: completed.did,
    });
    return serializeSingle(request, CredentialSerializer, credential);
  }
}
