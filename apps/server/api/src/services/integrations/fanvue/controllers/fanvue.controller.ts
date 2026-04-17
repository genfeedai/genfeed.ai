import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  CreateCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { ConfigService } from '@api/config/config.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnBadRequest,
  returnInternalServerError,
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { FanvueService } from '@api/services/integrations/fanvue/services/fanvue.service';
import { EncryptionUtil } from '@api/shared/utils/encryption/encryption.util';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/fanvue')
export class FanvueController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly fanvueService: FanvueService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Step 1: Generate Fanvue OAuth URL with PKCE challenge.
   * The code_verifier is stored encrypted in the credential's oauthToken field.
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createCredentialDto: Partial<CreateCredentialDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(url, createCredentialDto);

    const publicMetadata = getPublicMetadata(user);

    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(createCredentialDto.brand),
      isDeleted: false,
      organization: new Types.ObjectId(publicMetadata.organization),
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    // Generate PKCE pair
    const { codeVerifier, codeChallenge } = this.fanvueService.generatePkce();

    // Save placeholder credential with encrypted code_verifier in oauthToken
    await this.credentialsService.saveCredentials(
      brand,
      CredentialPlatform.FANVUE,
      {
        accessToken: undefined,
        isConnected: false,
        oauthToken: codeVerifier,
        oauthTokenSecret: undefined,
      },
    );

    const state = JSON.stringify({
      brandId: brand._id,
      organizationId: brand.organization,
      userId: publicMetadata.user,
    });

    const clientId = this.configService.get('FANVUE_CLIENT_ID');

    this.loggerService.log(`${url} - Generating OAuth URL with PKCE`, {
      clientId: clientId ? 'configured' : 'missing',
      redirectUri: this.configService.get('FANVUE_REDIRECT_URI'),
    });

    const authUrl = this.fanvueService.buildAuthUrl(state, codeChallenge);

    return serializeSingle(request, CredentialOAuthSerializer, {
      url: authUrl,
    });
  }

  /**
   * Step 2: Exchange authorization code for tokens using the stored code_verifier.
   * Clears the code_verifier after successful token exchange.
   */
  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() createCredentialVerifyDto: Partial<CreateCredentialVerifyDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, createCredentialVerifyDto);

    try {
      const { code, state } = createCredentialVerifyDto;

      if (!code || !state) {
        return returnBadRequest({
          detail: 'Missing code or identifiers',
          title: 'Invalid payload',
        });
      }

      const { brandId, organizationId } = JSON.parse(state);

      // Find the existing credential to retrieve the code_verifier
      const existingCredential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.FANVUE,
      });

      if (!existingCredential) {
        return returnNotFound('Credential', brandId);
      }

      if (!existingCredential.oauthToken) {
        return returnBadRequest({
          detail:
            'PKCE code_verifier not found. Please restart the connection flow.',
          title: 'Invalid state',
        });
      }

      // Decrypt the stored code_verifier
      const codeVerifier = EncryptionUtil.decrypt(
        existingCredential.oauthToken,
      );

      // Exchange code for tokens with code_verifier
      const tokens = await this.fanvueService.exchangeCodeForTokens(
        code,
        codeVerifier,
      );

      if (!tokens.access_token) {
        return returnBadRequest({
          detail: 'Failed to obtain access token from Fanvue',
          title: 'Token exchange failed',
        });
      }

      // Fetch user profile to store external ID and handle
      let externalId: string | undefined;
      let externalHandle: string | undefined;
      let externalName: string | undefined;

      try {
        const profile = await this.fanvueService.getUserProfile(
          tokens.access_token,
        );
        externalId = profile.uuid;
        externalHandle = profile.handle;
        externalName = profile.displayName;
      } catch (profileError: unknown) {
        this.loggerService.warn(
          `${url} - Could not fetch Fanvue profile, continuing without it`,
          profileError,
        );
      }

      // Update credential with tokens, clear code_verifier
      const credential = await this.credentialsService.patch(
        existingCredential._id,
        {
          accessToken: tokens.access_token,
          accessTokenExpiry: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000)
            : undefined,
          externalHandle,
          externalId,
          externalName,
          isConnected: true,
          isDeleted: false,
          oauthToken: undefined, // Clear code_verifier
          oauthTokenSecret: undefined,
          refreshToken: tokens.refresh_token,
        },
      );

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      const errorData = (
        error as { response?: { data?: Record<string, string> } }
      )?.response?.data;
      if (
        errorData?.error === 'invalid_grant' ||
        errorData?.error === 'invalid_request'
      ) {
        return returnBadRequest({
          detail:
            errorData?.message ||
            'Invalid or expired authorization code. Please try connecting again.',
          title: 'Authentication failed',
        });
      }

      return returnInternalServerError('Failed to verify Fanvue OAuth');
    }
  }
}
