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
import {
  classifyApiKeyConnectError,
  createApiKeyConnectException,
} from '@api/services/integrations/_shared/api-key-connect-error.util';
import { GhostService } from '@api/services/integrations/ghost/services/ghost.service';
import {
  parseGhostConnectInput,
  toGhostSiteKey,
} from '@api/services/integrations/ghost/utils/ghost-connect-input.util';
import {
  ApiKeyConnectErrorCode,
  CredentialPlatform,
} from '@genfeedai/contracts';
import type {
  GhostConnectPayload,
  GhostCreatePostPayload,
} from '@genfeedai/contracts/interfaces';
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

    if (
      typeof body.ghostUrl !== 'string' ||
      typeof body.apiKey !== 'string' ||
      !body.ghostUrl ||
      !body.apiKey ||
      !body.brandId
    ) {
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

    const input = parseGhostConnectInput(body.ghostUrl, body.apiKey);
    if (!input.ok) {
      throw createApiKeyConnectException(input.code);
    }

    let siteTitle: string | undefined;
    try {
      // Verify the pair by reading the site: proves the URL is a Ghost site
      // and that it accepts the key.
      const siteInfo = await this.ghostService.getSiteInfo(
        input.ghostUrl,
        input.apiKey,
      );
      siteTitle = siteInfo?.title;
    } catch (error: unknown) {
      const code = classifyApiKeyConnectError(error);
      // The service already logged the failure; only the outcome goes here.
      this.loggerService.warn(`${url} refused`, { code });
      throw createApiKeyConnectException(code);
    }
    // A site that answers 200 without Ghost's site object (a page that
    // serves every path, say) has no Ghost Admin API at this address.
    if (typeof siteTitle !== 'string') {
      this.loggerService.warn(`${url} refused`, {
        code: ApiKeyConnectErrorCode.API_NOT_FOUND,
      });
      throw createApiKeyConnectException(ApiKeyConnectErrorCode.API_NOT_FOUND);
    }

    // Sites connected before the address was cleaned up are stored as typed
    // (`https://myblog.com/`, say). Reuse that spelling when it names the
    // same site, so reconnecting updates the account instead of adding one.
    const existingAccounts = await this.credentialsService.findBrandAccounts(
      brand.organizationId,
      brand.id,
      CredentialPlatform.GHOST,
    );
    const siteKey = toGhostSiteKey(input.ghostUrl);
    const siteId =
      existingAccounts
        .map((account) => account.externalId)
        .find(
          (externalId): externalId is string =>
            typeof externalId === 'string' &&
            toGhostSiteKey(externalId) === siteKey,
        ) ?? input.ghostUrl;

    // Provision the row first, then let identity reconciliation decide
    // whether this is a reconnect of a site the brand already has or an
    // additional one. The site URL is the identity — a brand may run several
    // Ghost blogs, and two of them can share a title.
    const pending = await this.credentialsService.createPendingForBrand(
      brand,
      user.userId ?? user.id,
      CredentialPlatform.GHOST,
      { accessToken: input.apiKey },
    );

    const credential = await this.credentialsService.updateExternalProfile(
      pending.id,
      brand.organizationId,
      {
        // A Ghost site URL is an address, not a public @handle.
        handle: undefined,
        id: siteId,
        name: siteTitle,
      },
    );

    return serializeSingle(request, CredentialSerializer, credential);
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
