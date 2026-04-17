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
import { MediumService } from '@api/services/integrations/medium/services/medium.service';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import {
  CredentialOAuthSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import {
  Body,
  Controller,
  HttpException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

@AutoSwagger()
@Controller('services/medium')
export class MediumController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly mediumService: MediumService,
  ) {}

  /**
   * Initiate Medium OAuth flow
   * POST /services/medium/connect
   */
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

    try {
      // Save initial credential
      await this.credentialsService.saveCredentials(
        brand,
        CredentialPlatform.MEDIUM,
        {
          isConnected: false,
          platform: CredentialPlatform.MEDIUM,
        },
      );

      // Generate state for OAuth
      const state = JSON.stringify({
        brandId: brand._id.toString(),
        organizationId: brand.organization.toString(),
        userId: publicMetadata.user,
      });

      // Generate auth URL
      const authUrl = this.mediumService.generateAuthUrl(state);

      return serializeSingle(request, CredentialOAuthSerializer, {
        url: authUrl,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return returnInternalServerError('Failed to initiate Medium OAuth');
    }
  }

  /**
   * Verify Medium OAuth callback
   * POST /services/medium/verify
   */
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
          detail: 'Missing code or state',
          title: 'Invalid payload',
        });
      }

      const { brandId, organizationId } = JSON.parse(state);

      // Exchange code for access token
      const { accessToken, refreshToken, expiresIn } =
        await this.mediumService.exchangeAuthCodeForAccessToken(code);

      // Get user profile
      const profile = await this.mediumService.getUserProfile(accessToken);

      // Calculate token expiry
      const expiryDate = new Date(expiresIn * 1000);

      // Find and update the existing credential
      const existingCredential = await this.credentialsService.findOne({
        brand: new Types.ObjectId(brandId),
        organization: new Types.ObjectId(organizationId),
        platform: CredentialPlatform.MEDIUM,
      });

      if (!existingCredential) {
        return returnNotFound('Credential', brandId);
      }

      // Update the credential with the access token
      const credential = await this.credentialsService.patch(
        existingCredential._id,
        {
          accessToken,
          accessTokenExpiry: expiryDate,
          externalHandle: profile.username,
          externalId: profile.id,
          isConnected: true,
          refreshToken,
        },
      );

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      return returnInternalServerError('Failed to verify Medium OAuth');
    }
  }

  /**
   * Publish article to Medium
   * POST /services/medium/publish/:articleId
   */
  @Post('publish/:articleId')
  async publishArticle(
    @CurrentUser() user: User,
    @Param('articleId') articleId: string,
    @Query('brandId') brandId: string,
    @Query('publishStatus')
    publishStatus: 'public' | 'draft' | 'unlisted' = 'public',
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    this.loggerService.log(url, { articleId, brandId, publishStatus });

    try {
      if (!brandId) {
        return returnBadRequest({
          detail: 'Missing brandId',
          title: 'Invalid payload',
        });
      }

      const mediumPost = await this.mediumService.publishArticle(
        articleId,
        publicMetadata.organization,
        brandId,
        publishStatus,
      );

      return {
        data: mediumPost,
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      return returnInternalServerError('Failed to publish article to Medium');
    }
  }
}
