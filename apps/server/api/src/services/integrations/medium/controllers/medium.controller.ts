import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import {
  ConnectCredentialDto,
  CreateCredentialVerifyDto,
} from '@api/collections/credentials/dto/create-credential.dto';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnBadRequest,
  returnInternalServerError,
  returnNotFound,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { MediumService } from '@api/services/integrations/medium/services/medium.service';
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

    try {
      const { state } = await this.credentialsService.beginOAuthForBrand(
        brand,
        user.userId ?? user.id,
        CredentialPlatform.MEDIUM,
        {
          isConnected: false,
        },
      );

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

      const existingCredential =
        await this.credentialsService.findPendingOAuthCredential(
          state,
          CredentialPlatform.MEDIUM,
        );

      if (!existingCredential) {
        return returnNotFound('Pending OAuth credential', state);
      }

      // Exchange code for access token
      const { accessToken, refreshToken, expiresIn } =
        await this.mediumService.exchangeAuthCodeForAccessToken(code);

      if (!accessToken) {
        return returnBadRequest({
          detail: 'Medium did not return an access token',
          title: 'Token exchange failed',
        });
      }

      // Get user profile
      const profile = await this.mediumService.getUserProfile(accessToken);

      // Calculate token expiry
      const expiryDate = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : undefined;

      // Update the credential with the access token, then settle identity so a
      // second Medium author adds an account rather than replacing the first.
      const credential = await this.credentialsService.connectAccount(
        existingCredential.id,
        existingCredential.organizationId,
        {
          handle: profile.username,
          id: profile.id,
          name: profile.username,
        },
        {
          accessToken,
          accessTokenExpiry: expiryDate,
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
    @Query('credentialId') credentialId?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

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
        user.organizationId,
        brandId,
        publishStatus,
        credentialId,
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
