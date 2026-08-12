import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  returnBadRequest,
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import {
  getSafeLinkedInOAuthErrorLog,
  throwMappedLinkedInOAuthError,
} from '@api/services/integrations/linkedin/utils/linkedin-oauth-error.util';
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
@Controller('services/linkedin')
export class LinkedInController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly linkedInService: LinkedInService,
  ) {}

  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() createCredentialDto: ConnectCredentialDto,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    this.loggerService.log(url, createCredentialDto);

    const brand = await this.brandsService.findOne({
      id: createCredentialDto.brandId,
      organizationId: publicMetadata.organization,
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    try {
      const { state } = await this.credentialsService.beginOAuthForBrand(
        brand,
        publicMetadata.user,
        CredentialPlatform.LINKEDIN,
        {
          isConnected: false,
        },
      );

      const authUrl = this.linkedInService.generateAuthUrl(state);

      return serializeSingle(request, CredentialOAuthSerializer, {
        url: authUrl,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        getSafeLinkedInOAuthErrorLog(error),
      );
      return throwMappedLinkedInOAuthError(
        error,
        'Failed to initiate LinkedIn OAuth',
      );
    }
  }

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

    const { code, state } = createCredentialVerifyDto;

    try {
      if (!code || !state) {
        return returnBadRequest({
          detail: 'Missing code or identifiers',
          title: 'Invalid payload',
        });
      }

      const existingCredential =
        await this.credentialsService.findPendingOAuthCredential(
          state,
          CredentialPlatform.LINKEDIN,
        );

      if (!existingCredential) {
        return returnNotFound('Pending OAuth credential', state);
      }

      const { organizationId } = existingCredential;

      // Exchange code for access token
      const { accessToken, expiresIn } =
        await this.linkedInService.exchangeAuthCodeForAccessToken(code);

      if (!accessToken) {
        return returnBadRequest({
          detail: 'LinkedIn did not return an access token',
          title: 'Token exchange failed',
        });
      }

      // Get user profile
      const profile = await this.linkedInService.getUserProfile(accessToken);

      // Calculate token expiry
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);

      // Update the credential with the access token
      // If reconnecting the same account, reactivate previously deleted credential
      let credential = await this.credentialsService.patch(
        existingCredential.id,
        {
          accessToken,
          accessTokenExpiry: expiryDate,
          isConnected: true,
          isDeleted: false, // Reactivate if previously disconnected
          oauthState: null,
        },
      );

      const profileName = `${profile.firstName} ${profile.lastName}`.trim();
      credential = await this.credentialsService.updateExternalProfile(
        credential.id,
        organizationId,
        {
          avatarUrl: profile.picture,
          handle: profileName,
          id: profile.id,
          name: profileName,
        },
      );

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed`,
        getSafeLinkedInOAuthErrorLog(error),
      );
      return throwMappedLinkedInOAuthError(
        error,
        'Failed to verify LinkedIn OAuth',
      );
    }
  }
}
