import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { UpdateCredentialDto } from '@api/collections/credentials/dto/update-credential.dto';
import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { toCredentialPlatform } from '@api/collections/credentials/utils/credential-platform.util';
import { CreateTagDto } from '@api/collections/tags/dto/create-tag.dto';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RequiredScopes } from '@api/helpers/decorators/scopes/required-scopes.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { TenantReadPolicy } from '@api/helpers/interceptors/tenant-context/tenant-read-policy.decorator';
import { API_KEY_CONNECTED_ACCOUNT_READ_SCOPES } from '@api/helpers/utils/auth/api-key-publishing-scope.util';
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
import { isLinkedinAuthorizationError } from '@api/services/integrations/linkedin/utils/linkedin-error.util';
import { PinterestService } from '@api/services/integrations/pinterest/services/pinterest.service';
import { RedditService } from '@api/services/integrations/reddit/services/reddit.service';
import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { ApiKeyScope, CredentialPlatform } from '@genfeedai/contracts';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
} from '@genfeedai/contracts/interfaces';
import {
  CredentialInstagramPagesSerializer,
  CredentialLinkedInAccountsSerializer,
  CredentialSerializer,
} from '@genfeedai/serializers';
import { crossOrgUnsafe } from '@libs/prisma/tenant-context';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
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
  refreshToken(
    orgId: string,
    brandId: string,
    credentialId?: string,
  ): Promise<unknown>;
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

  @RequiredScopes(...API_KEY_CONNECTED_ACCOUNT_READ_SCOPES)
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
    const isSuperAdmin = getIsSuperAdmin(user, request);
    const scope = CollectionFilterUtil.resolveAuthorizedTenantQuery(
      query,
      user,
      isSuperAdmin,
    );
    // Every list is organization-scoped; a plain `GET /credentials` lists the
    // caller's own credentials in the active organization.
    const organizationId = scope.organizationId ?? user.organizationId;
    if (scope.brandId) {
      where.brandId = scope.brandId;
    }
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const aggregate = {
      where,
      orderBy: handleQuerySort(query.sort),
    };

    // Only a superadmin can ask for another organization's credentials.
    const data: AggregatePaginateResult<CredentialDocument> =
      isSuperAdmin && organizationId !== user.organizationId
        ? await crossOrgUnsafe(
            async () =>
              await this.credentialsService.findAll(aggregate, options),
          )
        : await this.credentialsService.findAll(aggregate, options);
    return serializeCollection(request, CredentialSerializer, data);
  }

  @RequiredScopes(...API_KEY_CONNECTED_ACCOUNT_READ_SCOPES)
  @Get(':credentialId')
  @SetMetadata('roles', ['superadmin'])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(
    @Req() request: Request,
    @Param('credentialId') credentialId: string,
  ): Promise<JsonApiSingleResponse> {
    // Superadmin-only route: reads a credential in any organization.
    const data: CredentialDocument | null = await crossOrgUnsafe(
      async () =>
        await this.credentialsService.findOne({
          id: credentialId,
        }),
    );

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
    const credential = await this.credentialsService.findOneSelect(
      { id: credentialId, organizationId: user.organizationId },
      { brandId: true, id: true, organizationId: true, platform: true },
    );

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
      await refresher.refreshToken(
        credentialOrganizationId,
        credentialBrandId,
        credential.id,
      );

      const updatedCredential = await this.credentialsService.findOne({
        id: credential.id,
        organizationId: credentialOrganizationId,
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

  @TenantReadPolicy('mutating')
  @RequiredScopes(...API_KEY_CONNECTED_ACCOUNT_READ_SCOPES)
  @Get(':credentialId/instagram/pages')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllInstagramPages(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
  ): Promise<JsonApiCollectionResponse> {
    try {
      // Scoped to this credential's own token — not the brand's default
      // account, which may be a different Instagram account than the one
      // being set up. `listAuthorizedInstagramAccounts` is the same source
      // of truth `InstagramController.resolveAuthorizedAccount` and
      // `selectAccount` use, so the picker's candidates never drift from
      // what a selection will actually be validated against.
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

      const accessToken = EncryptionUtil.decrypt(credential.accessToken);
      const pages =
        await this.instagramService.listAuthorizedInstagramAccounts(
          accessToken,
        );

      // Flag candidates already held by another live credential of this
      // brand, the same sibling exclusion
      // `InstagramConnectionResolverService.resolveAuthorizedAccount` applies
      // when auto-resolving — the picker still lists them (choosing one is a
      // legitimate deliberate reconnect, merging into that incumbent), but
      // the UI can now tell the operator which candidates that applies to.
      const heldAccounts = credential.brandId
        ? await this.credentialsService.findConnectedAccounts(
            user.organizationId,
            credential.brandId,
            CredentialPlatform.INSTAGRAM,
          )
        : [];
      const heldExternalIds = new Set(
        heldAccounts
          .filter((account) => account.id !== credential.id)
          .map((account) => account.externalId)
          .filter((externalId): externalId is string => Boolean(externalId)),
      );
      const pagesWithHeldFlag = pages.map((page) => ({
        ...page,
        isAlreadyConnected: heldExternalIds.has(page.id),
      }));

      return serializeCollection(request, CredentialInstagramPagesSerializer, {
        docs: pagesWithHeldFlag,
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

  /**
   * The accounts a LinkedIn connection can post as: the member's profile and
   * every company page they hold a posting role on. Read with this
   * credential's own token, so the picker never offers more than a selection
   * will accept (see `LinkedInController.selectAccount`).
   */
  @TenantReadPolicy('mutating')
  @RequiredScopes(...API_KEY_CONNECTED_ACCOUNT_READ_SCOPES)
  @Get(':credentialId/linkedin/accounts')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllLinkedInAccounts(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('credentialId') credentialId: string,
  ): Promise<JsonApiCollectionResponse> {
    const credential = await this.credentialsService.findOne({
      id: credentialId,
      organizationId: user.organizationId,
      platform: CredentialPlatform.LINKEDIN,
    });

    if (!credential?.accessToken) {
      throw new HttpException(
        {
          detail: 'LinkedIn account is not connected',
          title: 'Not Connected',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const accounts = await this.linkedInService.listAuthorizedAccounts(
        EncryptionUtil.decrypt(credential.accessToken),
      );

      // Flag accounts another live credential of this brand already holds. The
      // picker still lists them: choosing one is a deliberate reconnect that
      // merges into that incumbent.
      const heldAccounts = credential.brandId
        ? await this.credentialsService.findConnectedAccounts(
            user.organizationId,
            credential.brandId,
            CredentialPlatform.LINKEDIN,
          )
        : [];
      const heldExternalIds = new Set(
        heldAccounts
          .filter((account) => account.id !== credential.id)
          .map((account) => account.externalId)
          .filter((externalId): externalId is string => Boolean(externalId)),
      );

      return serializeCollection(
        request,
        CredentialLinkedInAccountsSerializer,
        {
          docs: accounts.map((account) => ({
            ...account,
            isAlreadyConnected: heldExternalIds.has(account.id),
            platform: CredentialPlatform.LINKEDIN,
          })),
        },
      );
    } catch (error: unknown) {
      if (isLinkedinAuthorizationError(error)) {
        throw new HttpException(
          {
            detail:
              'Your LinkedIn connection has expired. Please reconnect your LinkedIn account.',
            title: 'Authentication failed',
          },
          HttpStatus.UNAUTHORIZED,
        );
      }

      throw error;
    }
  }

  // Rewrites or disconnects the organization's social account tokens: only
  // keys trusted to publish to those accounts (or admin keys) may do it.
  @Patch(':credentialId')
  @RequiredScopes(ApiKeyScope.POSTS_PUBLISH, ApiKeyScope.ADMIN)
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

    // Provider identity (externalId/externalHandle/externalName/
    // externalAvatar) is never client-writable through this generic
    // endpoint: `updateExternalProfile`'s reconciliation can move a
    // credential's token onto a *different* existing row when the claimed
    // externalId matches one, so accepting an operator-supplied externalId
    // here would let any same-org caller repoint another account's
    // connection. Every platform resolves and persists that identity itself
    // (OAuth verify, or — for Instagram's multi-account case — the
    // dedicated `POST /services/instagram/:credentialId/select-account`,
    // which validates the chosen id against the credential's own token
    // before calling `updateExternalProfile`).
    const allowedFields: (keyof UpdateCredentialDto)[] = [
      'accessToken',
      'accessTokenExpiry',
      'accessTokenSecret',
      'description',
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

    let data: CredentialDocument = credential;

    if (Object.keys(sanitizedUpdate).length > 0) {
      data = await this.credentialsService.patch(
        credential.id,
        sanitizedUpdate as Partial<UpdateCredentialDto>,
      );
    }

    return data
      ? serializeSingle(request, CredentialSerializer, data)
      : returnNotFound(this.constructorName, credentialId);
  }

  @Delete(':credentialId')
  @RequiredScopes(ApiKeyScope.POSTS_PUBLISH, ApiKeyScope.ADMIN)
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async remove(
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: User,
    @Req() request: Request,
  ): Promise<JsonApiSingleResponse> {
    // Verify ownership before deletion
    const credential = await this.credentialsService.findOneSelect(
      { id: credentialId, organizationId: user.organizationId },
      { id: true },
    );

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
