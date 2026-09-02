import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';
import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { toCredentialPlatform } from '@api/collections/credentials/utils/credential-platform.util';
import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { CollectionFilterUtil } from '@api/helpers/utils/collection-filter/collection-filter.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { GoogleSearchConsoleService } from '@api/services/integrations/google-search-console/services/google-search-console.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { CredentialPlatform } from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import {
  CredentialInstagramPagesSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

interface TokenRefreshService {
  refreshToken(orgId: string, brandId: string): Promise<unknown>;
}

@AutoSwagger()
@Controller('credentials')
@UseGuards(RolesGuard)
export class CredentialsController {
  private readonly constructorName: string = String(this.constructor.name);
  private readonly platformRefreshers: Map<
    CredentialPlatform,
    TokenRefreshService
  >;

  constructor(
    private readonly brandsService: BrandsService,
    private readonly credentialsService: CredentialsService,
    private readonly facebookService: FacebookService,
    private readonly googleAdsService: GoogleAdsService,
    private readonly googleSearchConsoleService: GoogleSearchConsoleService,
    private readonly instagramService: InstagramService,
    private readonly linkedInService: LinkedInService,
    private readonly pinterestService: PinterestService,
    private readonly redditService: RedditService,
    private readonly tiktokService: TiktokService,
    private readonly twitterService: TwitterService,
    private readonly youtubeService: YoutubeService,
  ) {
    this.platformRefreshers = new Map<CredentialPlatform, TokenRefreshService>([
      [CredentialPlatform.FACEBOOK, this.facebookService],
      [CredentialPlatform.GOOGLE_ADS, this.googleAdsService],
      [
        CredentialPlatform.GOOGLE_SEARCH_CONSOLE,
        this.googleSearchConsoleService,
      ],
      [CredentialPlatform.INSTAGRAM, this.instagramService],
      [CredentialPlatform.LINKEDIN, this.linkedInService],
      [CredentialPlatform.PINTEREST, this.pinterestService],
      [CredentialPlatform.REDDIT, this.redditService],
      [CredentialPlatform.TIKTOK, this.tiktokService],
      [CredentialPlatform.TWITTER, this.twitterService],
      [CredentialPlatform.YOUTUBE, this.youtubeService],
    ]);
  }

  @Get()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Query() query: BaseQueryDto,
    @Req() request: Request,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    // Prefer brand/org query filters (collection style); keep user ownership as
    // the default so the list stays tenant-safe for members. Reject foreign org.
    const where: Record<string, unknown> = {
      isDeleted,
      userId: user.userId ?? user.id,
    };
    if (query.brandId || query.organizationId) {
      const scope = CollectionFilterUtil.resolveAuthorizedTenantQuery(
        query,
        user,
        getIsSuperAdmin(user, request),
      );
      if (scope.brandId) {
        where.brandId = scope.brandId;
      }
      if (scope.organizationId) {
        where.organizationId = scope.organizationId;
      }
    }

    const aggregate = {
      where,
      orderBy: handleQuerySort(query.sort),
    };

    const data: AggregatePaginateResult<CredentialDocument> =
      await this.credentialsService.findAll(aggregate, options);
    return serializeCollection(request, CredentialSerializer, data);
  }

  @Get(':credentialId')
  @SetMetadata('roles', ['superadmin'])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('credentialId') credentialId: string,
  ): Promise<JsonApiSingleResponse> {
    const data: CredentialDocument | null =
      await this.credentialsService.findOne({
        id: credentialId,
      });

    return data
      ? serializeSingle(request, CredentialSerializer, data)
      : returnNotFound(this.constructorName, credentialId);
  }

  @Post(':credentialId/refresh')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async refreshCredentialToken(
    @Req() request: Request,
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
    });

    if (!credential) {
      return returnNotFound(this.constructorName, credentialId);
    }

    const refresher = this.platformRefreshers.get(
      toCredentialPlatform(credential.platform),
    );

    if (!refresher) {
      throw new HttpException(
        {
          detail: `Token refresh is not supported for platform: ${credential.platform}`,
          title: 'Unsupported Platform',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const credentialOrganizationId = credential.organizationId ?? undefined;
    const credentialBrandId = credential.brandId ?? undefined;

    if (!credentialOrganizationId || !credentialBrandId) {
      throw new HttpException(
        {
          detail: 'Credential is missing brand or organization context',
          title: 'Invalid Credential',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await refresher.refreshToken(credentialOrganizationId, credentialBrandId);

      const updatedCredential = await this.credentialsService.findOne({
        id: credential.id,
      });

      return updatedCredential
        ? serializeSingle(request, CredentialSerializer, updatedCredential)
        : returnNotFound(this.constructorName, credentialId);
    } catch {
      await this.credentialsService.patch(credential.id, {
        isConnected: false,
      });

      throw new HttpException(
        {
          detail: 'Failed to refresh token. Please reconnect your account.',
          title: 'Token Refresh Failed',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }

  @Get(':credentialId/instagram/pages')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllInstagramPages(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
  ): Promise<JsonApiCollectionResponse> {
    try {
      // Get the Instagram credential for this brand
      const credential = await this.credentialsService.findOne({
        id: credentialId,
        organizationId: user.organizationId,
        platform: CredentialPlatform.INSTAGRAM,
      });

      if (!credential?.accessToken) {
        throw new HttpException(
          {
            detail: 'Instagram account is not connected',
            title: 'Not Connected',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const brandId = credential.brandId ?? undefined;
      if (!brandId) {
        throw new HttpException(
          {
            detail: 'Credential is missing a connected brand',
            title: 'Invalid Credential',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const brand = await this.brandsService.findOne({
        id: brandId,
        organizationId: user.organizationId,
      });

      if (!brand) {
        return returnNotFound('Brand', brandId);
      }

      // Get all available handles from the Instagram service
      const pages = await this.instagramService.getInstagramPages(
        user.organizationId,
        brand.id.toString(),
      );

      return serializeCollection(request, CredentialInstagramPagesSerializer, {
        docs: pages,
      });
    } catch (error: unknown) {
      // Handle expired/invalid token errors from Facebook Graph API
      // Error code 190: Access token expired
      // Error code 102: Session key invalid or no longer valid
      const response =
        (
          error as {
            response?: {
              data?: { error?: { code?: number }; error_code?: number };
            };
          }
        )?.response ||
        (
          error as {
            error?: {
              response?: {
                data?: { error?: { code?: number }; error_code?: number };
              };
            };
          }
        )?.error?.response;
      const errorCode =
        response?.data?.error?.code || response?.data?.error_code;

      if (errorCode === 190 || errorCode === 102) {
        // Find the credential and mark it as disconnected
        const credential = await this.credentialsService.findOne({
          id: credentialId,
          organizationId: user.organizationId,
          platform: CredentialPlatform.INSTAGRAM,
        });

        if (credential) {
          await this.credentialsService.patch(credential.id, {
            isConnected: false,
          });
        }

        throw new HttpException(
          {
            detail:
              'Your Instagram connection has expired. Please reconnect your Instagram account.',
            title: 'Authentication failed',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      throw error;
    }
  }

  @Patch(':credentialId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('credentialId') credentialId: string,
    @Body() updateCredentialDto: UpdateCredentialDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
    });

    if (!credential) {
      return returnNotFound(this.constructorName, credentialId);
    }

    const allowedFields: (keyof UpdateCredentialDto)[] = [
      'accessToken',
      'accessTokenExpiry',
      'accessTokenSecret',
      'description',
      'externalAvatar',
      'externalHandle',
      'externalId',
      'externalName',
      'isConnected',
      'isDeleted',
      'label',
      'oauthToken',
      'oauthTokenSecret',
      'refreshToken',
      'refreshTokenExpiry',
      'tagIds',
    ];

    const sanitizedUpdate: Partial<
      Record<
        keyof UpdateCredentialDto,
        UpdateCredentialDto[keyof UpdateCredentialDto]
      >
    > = {};

    allowedFields.forEach((field) => {
      const value = updateCredentialDto[field];
      if (typeof value !== 'undefined') {
        sanitizedUpdate[field] = value;
      }
    });

    const {
      externalAvatar,
      externalHandle,
      externalId,
      externalName,
      ...credentialUpdate
    } = sanitizedUpdate;

    let data: CredentialDocument = credential;

    if (Object.keys(credentialUpdate).length > 0) {
      data = await this.credentialsService.patch(
        credential.id,
        credentialUpdate as Partial<UpdateCredentialDto>,
      );
    }

    const externalProfile = {
      avatarUrl:
        typeof externalAvatar === 'string' ? externalAvatar : undefined,
      handle: typeof externalHandle === 'string' ? externalHandle : undefined,
      id: typeof externalId === 'string' ? externalId : undefined,
      name: typeof externalName === 'string' ? externalName : undefined,
    };

    if (Object.values(externalProfile).some(Boolean)) {
      data = await this.credentialsService.updateExternalProfile(
        credential.id,
        user.organizationId,
        externalProfile,
      );
    }

    return data
      ? serializeSingle(request, CredentialSerializer, data)
      : returnNotFound(this.constructorName, credentialId);
  }

  @Delete(':credentialId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: User,
    @Req() request: Request,
  ): Promise<JsonApiSingleResponse> {
    // Verify ownership before deletion
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
    });

    if (!credential) {
      return returnNotFound(this.constructorName, credentialId);
    }

    // Soft delete the credential
    const data = await this.credentialsService.remove(credentialId);

    if (!data) {
      return returnNotFound(this.constructorName, credentialId);
    }

    return serializeSingle(request, CredentialSerializer, data);
  }

  @Post(':credentialId/tags')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async createCredentialTag(
    @Req() request: Request,
    @Param('credentialId') credentialId: string,
    @Body() createTagDto: CreateTagDto,
    @CurrentUser() user: User,
  ) {
    const data = await this.credentialsService.createAndAttachTag(
      credentialId,
      user.organizationId,
      user.userId ?? user.id,
      createTagDto,
    );

    return serializeSingle(request, CredentialSerializer, data);
  }
}
