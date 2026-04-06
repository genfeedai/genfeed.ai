import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import {
  returnBadRequest,
  returnInternalServerError,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { GhostService } from '@api/services/integrations/ghost/services/ghost.service';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import type {
  GhostConnectPayload,
  GhostCreatePostPayload,
} from '@genfeedai/interfaces';
import { CredentialSerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Body, Controller, HttpException, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Types } from 'mongoose';

@AutoSwagger()
@Controller('services/ghost')
export class GhostController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly ghostService: GhostService,
  ) {}

  /**
   * Connect Ghost by verifying URL + API key and storing credential.
   * POST /services/ghost/connect
   */
  @Post('connect')
  async connect(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: GhostConnectPayload,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const publicMetadata = getPublicMetadata(user);

    this.loggerService.log(url, {
      brand: body.brand,
      ghostUrl: body.ghostUrl,
    });

    if (!body.ghostUrl || !body.apiKey || !body.brand) {
      return returnBadRequest({
        detail: 'Missing ghostUrl, apiKey, or brand',
        title: 'Invalid payload',
      });
    }

    const brand = await this.brandsService.findOne({
      _id: new Types.ObjectId(body.brand),
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
      // Verify the Ghost credentials by fetching site info
      const siteInfo = await this.ghostService.getSiteInfo(
        body.ghostUrl,
        body.apiKey,
      );

      // Save or update the credential
      const credential = await this.credentialsService.saveCredentials(
        brand,
        CredentialPlatform.GHOST,
        {
          accessToken: body.apiKey,
          externalHandle: body.ghostUrl,
          externalId: siteInfo.title,
          externalName: siteInfo.title,
          isConnected: true,
          platform: CredentialPlatform.GHOST,
        },
      );

      return serializeSingle(request, CredentialSerializer, credential);
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      return returnInternalServerError(
        'Failed to connect Ghost. Verify your URL and Admin API key.',
      );
    }
  }

  /**
   * Create a post on Ghost.
   * POST /services/ghost/posts
   */
  @Post('posts')
  async createPost(
    @CurrentUser() _user: User,
    @Body() body: GhostCreatePostPayload,
  ) {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    this.loggerService.log(url, {
      status: body.status,
      title: body.title,
    });

    if (!body.ghostUrl || !body.apiKey || !body.title || !body.html) {
      return returnBadRequest({
        detail: 'Missing ghostUrl, apiKey, title, or html',
        title: 'Invalid payload',
      });
    }

    try {
      const ghostPost = await this.ghostService.createPost(
        body.ghostUrl,
        body.apiKey,
        body.title,
        body.html,
        body.status ?? 'draft',
        body.featureImage,
        body.tags,
      );

      return {
        data: {
          id: ghostPost.id,
          slug: ghostPost.slug,
          status: ghostPost.status,
          title: ghostPost.title,
          url: ghostPost.url,
        },
        success: true,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);

      if (error instanceof HttpException) {
        throw error;
      }

      return returnInternalServerError('Failed to create Ghost post');
    }
  }
}
