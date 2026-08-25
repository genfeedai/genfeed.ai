import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import {
  returnBadRequest,
  returnInternalServerError,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { GhostService } from '@api/services/integrations/ghost/services/ghost.service';
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

    this.loggerService.log(url, {
      brandId: body.brandId,
      ghostUrl: body.ghostUrl,
    });

    if (!body.ghostUrl || !body.apiKey || !body.brandId) {
      return returnBadRequest({
        detail: 'Missing ghostUrl, apiKey, or brandId',
        title: 'Invalid payload',
      });
    }

    const brand = await this.brandsService.findOne({
      id: body.brandId,
      organizationId: user.organizationId,
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

      // Provision the row first, then let identity reconciliation decide
      // whether this is a reconnect of a site the brand already has or an
      // additional one. The site URL is the identity — a brand may run several
      // Ghost blogs, and two of them can share a title.
      const pending = await this.credentialsService.createPendingForBrand(
        brand,
        user.userId ?? user.id,
        CredentialPlatform.GHOST,
        { accessToken: body.apiKey },
      );

      const credential = await this.credentialsService.updateExternalProfile(
        pending.id,
        brand.organizationId,
        {
          handle: body.ghostUrl,
          id: body.ghostUrl,
          name: siteInfo.title,
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
