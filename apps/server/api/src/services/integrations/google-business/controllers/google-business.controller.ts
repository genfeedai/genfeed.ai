import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CredentialDocument } from '@api/collections/credentials/credential.types';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { throwIfOAuthCallbackError } from '@api/collections/credentials/utils/oauth-callback-error.util';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import {
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { SelectGoogleBusinessLocationsDto } from '@api/services/integrations/google-business/dto/select-google-business-locations.dto';
import { GOOGLE_BUSINESS_SCOPE } from '@api/services/integrations/google-business/google-business.constants';
import { GoogleBusinessApiError } from '@api/services/integrations/google-business/google-business-error.util';
import type { GoogleBusinessLocation } from '@api/services/integrations/google-business/interfaces/google-business.interface';
import { GoogleBusinessService } from '@api/services/integrations/google-business/services/google-business.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import {
  buildGrantedScopesCredentialPatch,
  parseGrantedOAuthScopes,
} from '@genfeedai/helpers';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/google-business')
export class GoogleBusinessController {
  constructor(
    private readonly googleBusinessService: GoogleBusinessService,
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
  ) {}

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

    const { state } = await this.credentialsService.beginOAuthForBrand(
      brand,
      user.userId ?? user.id,
      CredentialPlatform.GOOGLE_BUSINESS,
      { isConnected: false },
      body.credentialId,
    );

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: this.googleBusinessService.generateAuthUrl(state),
    });
  }

  /**
   * OAuth callback. A Google account with one location connects it at once.
   * With several, the credential keeps its token and waits for
   * `POST :credentialId/select-location`; the serialized credential reports
   * `needsAccountSelection` so the caller knows to ask.
   */
  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() body: Partial<CreateCredentialVerifyDto>,
  ) {
    await throwIfOAuthCallbackError(
      this.credentialsService,
      body,
      CredentialPlatform.GOOGLE_BUSINESS,
    );

    if (!body.code || !body.state) {
      throw new BadRequestException('Missing required OAuth parameters');
    }

    const pending = await this.credentialsService.findPendingOAuthCredential(
      body.state,
      CredentialPlatform.GOOGLE_BUSINESS,
    );
    if (!pending) {
      throw new NotFoundException({
        message: 'No pending credential found for this OAuth state',
      });
    }

    let tokens: Awaited<
      ReturnType<GoogleBusinessService['exchangeCodeForTokens']>
    >;
    try {
      tokens = await this.googleBusinessService.exchangeCodeForTokens(
        body.code,
      );
    } catch (error: unknown) {
      this.loggerService.error('Google Business token exchange failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new BadGatewayException(
        'Google did not complete the connection. Please try connecting again.',
      );
    }

    // The consent screen lets the owner untick a scope; without this one no
    // call to the Business Profile APIs can succeed.
    if (
      !parseGrantedOAuthScopes(tokens.scope).includes(GOOGLE_BUSINESS_SCOPE)
    ) {
      throw new BadRequestException(
        'Google Business Profile access was not granted. Connect again and allow managing your business.',
      );
    }
    if (!tokens.refreshToken) {
      throw new BadGatewayException(
        'Google did not return a refresh token. Remove Genfeed from your Google account permissions and connect again.',
      );
    }

    const locations = await this.listLocationsOrExplain(tokens.accessToken);
    if (locations.length === 0) {
      throw new BadRequestException(
        'This Google account manages no business locations. Connect the account that owns or manages your Business Profile.',
      );
    }

    // The tokens wait on the pending credential until a location is chosen.
    // Not connected, and no externalId, so the serializer reports
    // `needsAccountSelection`.
    const credential = await this.credentialsService.patch(pending.id, {
      accessToken: tokens.accessToken,
      accessTokenExpiry: tokens.accessTokenExpiry,
      isConnected: false,
      isDeleted: false,
      oauthState: null,
      refreshToken: tokens.refreshToken,
      ...buildGrantedScopesCredentialPatch(tokens.scope),
    });

    const [only] = locations;
    if (locations.length === 1 && only) {
      const [connected] = await this.connectLocations(credential, [only]);
      return serializeSingle(
        request,
        CredentialSerializer,
        connected ?? credential,
      );
    }

    return serializeSingle(request, CredentialSerializer, credential);
  }

  /** The locations a pending connection can still choose from. */
  @TenantReadPolicy('owner')
  @Get(':credentialId/locations')
  async listLocations(
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
  ) {
    const credential = await this.requirePendingCredential(user, credentialId);
    const locations = await this.listLocationsOrExplain(
      EncryptionUtil.decrypt(credential.accessToken as string),
    );
    return { locations };
  }

  /**
   * Settle a pending connection onto the chosen locations. The first takes
   * this credential and each further one becomes its own credential on the
   * brand. Names are read again from Google, never trusted from the body.
   */
  @Post(':credentialId/select-location')
  async selectLocations(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
    @Body() body: SelectGoogleBusinessLocationsDto,
  ) {
    const credential = await this.requirePendingCredential(user, credentialId);
    const authorized = await this.listLocationsOrExplain(
      EncryptionUtil.decrypt(credential.accessToken as string),
    );
    const byId = new Map(authorized.map((location) => [location.id, location]));
    const chosen = body.locationIds.flatMap((id) => {
      const location = byId.get(id);
      return location ? [location] : [];
    });

    if (chosen.length !== body.locationIds.length) {
      throw new BadRequestException(
        'A selected location is not available to this Google account. Reconnect and try again.',
      );
    }

    const connected = await this.connectLocations(credential, chosen);
    return serializeCollection(request, CredentialSerializer, {
      docs: connected,
    });
  }

  /**
   * A pending credential is one that holds a token and was never settled onto a
   * location. Anything else must reconnect, so this cannot repoint a live
   * channel onto another location of the same Google account.
   */
  private async requirePendingCredential(
    user: User,
    credentialId: string,
  ): Promise<CredentialDocument> {
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
      platform: CredentialPlatform.GOOGLE_BUSINESS,
    });

    if (!credential || credential.isDeleted) {
      throw new NotFoundException('Google Business credential', credentialId);
    }
    if (credential.isConnected || credential.externalId) {
      throw new BadRequestException(
        'This credential is already connected to a location. Disconnect and reconnect to choose a different one.',
      );
    }
    if (!credential.accessToken) {
      throw new BadRequestException(
        'Google Business is not connected. Connect again.',
      );
    }
    return credential;
  }

  private async connectLocations(
    credential: CredentialDocument,
    locations: GoogleBusinessLocation[],
  ): Promise<CredentialDocument[]> {
    const [first, ...others] = locations;
    if (!first) {
      return [];
    }
    const { brandId, organizationId, userId } = credential;
    if (!organizationId) {
      throw new BadRequestException('This connection has no organization.');
    }
    if (others.length > 0 && (!brandId || !userId)) {
      throw new BadRequestException(
        'This connection is missing its brand or owner, so it can connect only one location. Choose one, or reconnect from the brand.',
      );
    }

    const connected = [
      await this.credentialsService.connectAccount(
        credential.id,
        organizationId,
        { id: first.id, name: first.title },
      ),
    ];

    if (!brandId || !userId) {
      return connected;
    }

    // Further locations share the one Google grant: each gets its own row
    // carrying a copy of the tokens, so each can be disconnected on its own.
    const accessToken = EncryptionUtil.decrypt(
      credential.accessToken as string,
    );
    const refreshToken = credential.refreshToken
      ? EncryptionUtil.decrypt(credential.refreshToken)
      : undefined;
    for (const location of others) {
      let siblingId: string | undefined;
      try {
        const sibling = await this.credentialsService.createPendingForBrand(
          { id: brandId, organizationId },
          userId,
          CredentialPlatform.GOOGLE_BUSINESS,
        );
        siblingId = sibling.id;
        connected.push(
          await this.credentialsService.connectAccount(
            siblingId,
            organizationId,
            { id: location.id, name: location.title },
            {
              accessToken,
              accessTokenExpiry: credential.accessTokenExpiry ?? null,
              grantedScopes: credential.grantedScopes ?? [],
              grantedScopesCapturedAt:
                credential.grantedScopesCapturedAt ?? null,
              refreshToken,
            },
          ),
        );
      } catch (error: unknown) {
        this.loggerService.warn(
          'Google Business could not connect an additional location',
          { error: error instanceof Error ? error.message : String(error) },
        );
        if (siblingId) {
          await this.credentialsService
            .patch(siblingId, { accessToken: null, isDeleted: true })
            .catch(() => undefined);
        }
      }
    }

    return connected;
  }

  private async listLocationsOrExplain(
    accessToken: string,
  ): Promise<GoogleBusinessLocation[]> {
    try {
      return await this.googleBusinessService.listLocations(accessToken);
    } catch (error: unknown) {
      this.loggerService.error('Google Business location listing failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (
        error instanceof GoogleBusinessApiError &&
        (error.status === 403 || error.status === 429)
      ) {
        throw new HttpException(
          {
            detail:
              'Google has not allowed Genfeed to read Business Profile locations yet. Business Profile API access must be approved for the project.',
            title: 'Google Business Profile unavailable',
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw new BadGatewayException(
        'Google Business Profile could not list your locations. Please try again.',
      );
    }
  }
}
