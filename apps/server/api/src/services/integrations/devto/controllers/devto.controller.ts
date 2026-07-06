import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import {
  returnBadRequest,
  returnInternalServerError,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { DevtoService } from '@api/services/integrations/devto/services/devto.service';
import { CredentialPlatform } from '@genfeedai/enums';
import { CredentialSerializer } from '@genfeedai/serializers';
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
@Controller('services/devto')
export class DevtoController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly devtoService: DevtoService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Connect dev.to by verifying the API key and storing the credential.
   * dev.to is API-key based (no OAuth): the key is validated by fetching the
   * authenticated user, whose handle/id are persisted alongside the credential.
   * POST /services/devto/connect
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: { apiKey: string; brandId: string },
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(url, { brandId: body.brandId });

    const publicMetadata = getPublicMetadata(user);

    if (!body.apiKey || !body.brandId) {
      return returnBadRequest({
        detail: 'API key and brand ID are required',
        title: 'Invalid payload',
      });
    }

    const brand = await this.brandsService.findOne({
      _id: body.brandId,
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
      // Verify the API key by fetching the authenticated dev.to user
      const devtoUser = await this.devtoService.getCurrentUser(body.apiKey);

      if (!devtoUser?.id) {
        return returnBadRequest({
          detail:
            'Could not verify this dev.to API key. Please check the key and try again.',
          title: 'Invalid API key',
        });
      }

      const credential = await this.credentialsService.saveCredentials(
        brand,
        CredentialPlatform.DEV_TO,
        {
          accessToken: body.apiKey,
          externalHandle: devtoUser.username,
          externalId: String(devtoUser.id),
          externalName: devtoUser.name,
          isConnected: true,
        },
      );

      this.loggerService.log(`${url} connected`, {
        devtoUserId: devtoUser.id,
        username: devtoUser.username,
      });

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return returnInternalServerError(
        'Failed to connect dev.to. Please verify your API key.',
      );
    }
  }

  /**
   * Publish an internal article to the brand's connected dev.to account.
   * POST /services/devto/publish/:articleId
   */
  @Post('publish/:articleId')
  async publishArticle(
    @CurrentUser() user: User,
    @Param('articleId') articleId: string,
    @Query('brandId') brandId: string,
    @Query('published') published?: string,
    @Query('tags') tags?: string,
    @Query('canonicalUrl') canonicalUrl?: string,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    this.loggerService.log(url, { articleId, brandId, published });

    if (!brandId) {
      return returnBadRequest({
        detail: 'Missing brandId',
        title: 'Invalid payload',
      });
    }

    try {
      const parsedTags = tags
        ? tags
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];

      const devtoArticle = await this.devtoService.publishArticle(
        articleId,
        publicMetadata.organization,
        brandId,
        {
          canonicalUrl,
          published: published !== 'false',
          tags: parsedTags,
        },
      );

      return {
        data: devtoArticle,
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      return returnInternalServerError('Failed to publish article to dev.to');
    }
  }
}
