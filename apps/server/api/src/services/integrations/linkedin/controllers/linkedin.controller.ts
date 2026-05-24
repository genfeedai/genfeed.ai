import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  CreateCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnBadRequest,
  returnInternalServerError,
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, HttpException, Post, Req } from '@nestjs/common';
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
    @Body() createCredentialDto: Partial<CreateCredentialDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    this.loggerService.log(url, createCredentialDto);

    const brand = await this.brandsService.findOne({
      _id: createCredentialDto.brand,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!brand) {
      return returnBadRequest({
        detail: 'You do not have access to this brand',
        title: 'Invalid payload',
      });
    }

    try {
      await this.credentialsService.saveCredentials(
        brand,
        CredentialPlatform.LINKEDIN,
        {
          isConnected: false,
          platform: CredentialPlatform.LINKEDIN,
        },
      );

      const state = JSON.stringify({
        brandId: brand._id.toString(),
        organizationId:
          brand.organization?.toString() ?? publicMetadata.organization,
        userId: publicMetadata.user,
      });

      const authUrl = this.linkedInService.generateAuthUrl(state);

      return serializeSingle(request, CredentialOAuthSerializer, {
        url: authUrl,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return returnInternalServerError('Failed to initiate LinkedIn OAuth');
    }
  }

  @Post('verify')
  async verify(
    @Req() request: Request,
    @Body() createCredentialVerifyDto: Partial<CreateCredentialVerifyDto>,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(url, createCredentialVerifyDto);

    const { code, state } = createCredentialVerifyDto;

    try {
      if (!code || !state) {
        return returnBadRequest({
          detail: 'Missing code or identifiers',
          title: 'Invalid payload',
        });
      }

      const { brandId, organizationId } = JSON.parse(state);

      // Exchange code for access token
      const { accessToken, expiresIn } =
        await this.linkedInService.exchangeAuthCodeForAccessToken(code);

      // Get user profile
      const profile = await this.linkedInService.getUserProfile(accessToken);

      // Calculate token expiry
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + expiresIn);

      // Find and update the existing credential
      const existingCredential = await this.credentialsService.findOne({
        brand: brandId,
        organization: organizationId,
        platform: CredentialPlatform.LINKEDIN,
      });

      if (!existingCredential) {
        return returnNotFound('Credential', brandId);
      }

      // Update the credential with the access token
      // If reconnecting the same account, reactivate previously deleted credential
      const credential = await this.credentialsService.patch(
        existingCredential._id,
        {
          accessToken,
          externalHandle: `${profile.firstName} ${profile.lastName}`,
          externalId: profile.id,
          isConnected: true,
          isDeleted: false, // Reactivate if previously disconnected
          refreshTokenExpiry: expiryDate,
        },
      );

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      return returnInternalServerError('Failed to verify LinkedIn OAuth');
    }
  }
}
