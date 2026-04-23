import { BrandsService } from '@api/collections/brands/services/brands.service';
import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';
import { CredentialEntity } from '@api/collections/credentials/entities/credential.entity';
import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { TagsService } from '@api/collections/tags/services/tags.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { ObjectIdUtil } from '@api/helpers/utils/objectid/objectid.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { FacebookService } from '@api/services/integrations/facebook/services/facebook.service';
import { GoogleAdsService } from '@api/services/integrations/google-ads/services/google-ads.service';
import { InstagramService } from '@api/services/integrations/instagram/services/instagram.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { QuotaService } from '@api/services/quota/quota.service';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type { User } from '@clerk/backend';
import { CredentialPlatform } from '@genfeedai/enums';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
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

interface CredentialMentionItem {
  avatar: string | null;
  handle: string;
  id: string;
  name: string;
  platform: CredentialPlatform;
}

function readId(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function toCredentialPlatform(platform: unknown): CredentialPlatform {
  return platform as unknown as CredentialPlatform;
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
    private readonly instagramService: InstagramService,
    private readonly linkedInService: LinkedInService,
    private readonly organizationsService: OrganizationsService,
    private readonly pinterestService: PinterestService,
    private readonly quotaService: QuotaService,
    private readonly redditService: RedditService,
    private readonly tagsService: TagsService,
    private readonly tiktokService: TiktokService,
    private readonly twitterService: TwitterService,
    private readonly youtubeService: YoutubeService,
  ) {
    this.platformRefreshers = new Map<CredentialPlatform, TokenRefreshService>([
      [CredentialPlatform.FACEBOOK, this.facebookService],
      [CredentialPlatform.GOOGLE_ADS, this.googleAdsService],
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

    const publicMetadata = getPublicMetadata(user);
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: Record<string, unknown>[] = [
      {
        $match: {
          isDeleted,
          user: publicMetadata.user,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<CredentialDocument> =
      await this.credentialsService.findAll(aggregate, options);
    return serializeCollection(request, CredentialSerializer, data);
  }

  @Get('mentions')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getMentions(
    @CurrentUser() user: User,
  ): Promise<{ mentions: CredentialMentionItem[] }> {
    const publicMetadata = getPublicMetadata(user);
    const credentials = await this.credentialsService.find({
      isConnected: true,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    const seen = new Set<string>();
    const mentions: CredentialMentionItem[] = [];
    for (const cred of credentials) {
      if (!cred.externalHandle) continue;
      const key = `${cred.externalHandle}:${cred.platform}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mentions.push({
        avatar: cred.externalAvatar ?? null,
        handle: cred.externalHandle,
        id: cred._id.toString(),
        name: cred.externalName ?? cred.externalHandle,
        platform: toCredentialPlatform(cred.platform),
      });
    }
    return { mentions };
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
        _id: credentialId,
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
    const publicMetadata = getPublicMetadata(user);

    const credential = await this.credentialsService.findOne({
      _id: credentialId,
      isDeleted: false,
      organization: publicMetadata.organization,
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

    const credentialOrganizationId = readId(credential.organization);
    const credentialBrandId = readId(credential.brand);

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
        _id: credential._id,
      });

      return updatedCredential
        ? serializeSingle(request, CredentialSerializer, updatedCredential)
        : returnNotFound(this.constructorName, credentialId);
    } catch {
      await this.credentialsService.patch(credential._id, {
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
      const publicMetadata = getPublicMetadata(user);

      // Get the Instagram credential for this brand
      const credential = await this.credentialsService.findOne({
        _id: credentialId,
        isDeleted: false,
        organization: publicMetadata.organization,
        platform: CredentialPlatform.INSTAGRAM,
      });

      if (!credential || !credential.accessToken) {
        throw new HttpException(
          {
            detail: 'Instagram account is not connected',
            title: 'Not Connected',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const brandId = readId(credential.brand);
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
        _id: brandId,
        isDeleted: false,
        organization: publicMetadata.organization,
      });

      if (!brand) {
        return returnNotFound('Brand', brandId);
      }

      // Get all available handles from the Instagram service
      const pages = await this.instagramService.getInstagramPages(
        publicMetadata.organization,
        brand._id.toString(),
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
        const publicMetadata = getPublicMetadata(user);
        const credential = await this.credentialsService.findOne({
          _id: credentialId,
          isDeleted: false,
          organization: publicMetadata.organization,
          platform: CredentialPlatform.INSTAGRAM,
        });

        if (credential) {
          await this.credentialsService.patch(credential._id, {
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
    const publicMetadata = getPublicMetadata(user);

    const credential = await this.credentialsService.findOne({
      _id: credentialId,
      isDeleted: false,
      organization: publicMetadata.organization,
    });

    if (!credential) {
      return returnNotFound(this.constructorName, credentialId);
    }

    const allowedFields: (keyof UpdateCredentialDto)[] = [
      'accessToken',
      'accessTokenExpiry',
      'accessTokenSecret',
      'description',
      'externalHandle',
      'externalId',
      'isConnected',
      'isDeleted',
      'label',
      'oauthToken',
      'oauthTokenSecret',
      'refreshToken',
      'refreshTokenExpiry',
      'tags',
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

    const data: CredentialDocument = await this.credentialsService.patch(
      credential._id,
      sanitizedUpdate as Partial<UpdateCredentialDto>,
    );

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
    const publicMetadata = getPublicMetadata(user);

    // Verify ownership before deletion
    const credential = await this.credentialsService.findOne({
      _id: credentialId,
      isDeleted: false,
      organization: publicMetadata.organization,
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
    const publicMetadata = getPublicMetadata(user);

    const enrichedBody = ObjectIdUtil.enrichWithUserContext(
      // @ts-expect-error TS2345
      createTagDto,
      publicMetadata,
    );

    // @ts-expect-error TS2345
    const data = await this.tagsService.create(enrichedBody);
    return data
      ? serializeSingle(request, CredentialSerializer, data)
      : returnNotFound(this.constructorName, credentialId);
  }

  @Get(':credentialId/quota')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getQuotaStatus(
    @Param('credentialId') credentialId: string,
    @Query('organizationId') organizationId: string,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    const publicMetadata = getPublicMetadata(user);

    // Verify ownership
    const credential = await this.credentialsService.findOne({
      _id: credentialId,
      user: publicMetadata.user,
    });

    if (!credential) {
      throw new HttpException(
        {
          detail: 'Credential not found',
          title: 'Credential not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const organization = await this.organizationsService.findOne({
      _id: organizationId || publicMetadata.organization,
    });

    if (!organization) {
      throw new HttpException(
        {
          detail: 'Organization not found',
          title: 'Organization not found',
        },
        HttpStatus.NOT_FOUND,
      );
    }

    const quotaStatus = await this.quotaService.checkQuota(
      credential,
      organization,
    );

    // Return in JSON:API format
    return {
      data: {
        attributes: quotaStatus,
        id: credential._id.toString(),
        type: 'quota-status',
      },
    };
  }
}
