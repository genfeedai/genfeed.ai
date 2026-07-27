import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { UpdateAssetGateDto } from '@api/collections/users/dto/update-asset-gate.dto';
import { UpdateUserDto } from '@api/collections/users/dto/update-user.dto';
import { UpdateUserOnboardingDto } from '@api/collections/users/dto/update-user-onboarding.dto';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  getIsSuperAdmin,
  getPublicMetadata,
  getStripeSubscriptionStatus,
  getSubscriptionTier,
} from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { SubscriptionStatus, SubscriptionTier } from '@genfeedai/enums';
import {
  type ISubscriptionsService,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { UserSerializer } from '@genfeedai/serializers';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { FilesClientService } from '@server/services/files-microservice/client/files-client.service';
import type { Request } from 'express';

@AutoSwagger()
@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly usersService: UsersService,
    @Inject(SUBSCRIPTIONS_SERVICE)
    private readonly subscriptionsService: ISubscriptionsService,
    private readonly filesClientService: FilesClientService,
    private readonly membersService: MembersService,
    private readonly requestContextCacheService: RequestContextCacheService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly betterAuthIdentityCacheService: BetterAuthIdentityCacheService,
  ) {}

  private isActiveSubscriptionStatus(value: unknown): boolean {
    return (
      value === SubscriptionStatus.ACTIVE ||
      value === SubscriptionStatus.TRIALING ||
      value === 'ACTIVE' ||
      value === 'TRIALING'
    );
  }

  private canAccessUser(targetUserId: string, currentUser: User): boolean {
    const publicMetadata = getPublicMetadata(currentUser);
    return getIsSuperAdmin(currentUser) || publicMetadata.user === targetUserId;
  }

  private async invalidateUserAccessCaches(userId: string): Promise<void> {
    await Promise.all([
      this.requestContextCacheService.invalidateForUser(userId),
      this.accessBootstrapCacheService.invalidateForUser(userId),
      this.betterAuthIdentityCacheService.invalidateForUser(userId),
    ]);
  }

  private async setBrandSelectionForUser(
    user: User,
    selectedBrandId: string | null,
  ): Promise<void> {
    const publicMetadata = getPublicMetadata(user);

    if (selectedBrandId === null) {
      await this.brandsService.clearBrandSelectionForUser(
        publicMetadata.user,
        publicMetadata.organization,
      );

      await this.membersService.setLastUsedBrand(
        {
          isActive: true,
          isDeleted: false,
          organization: publicMetadata.organization,
          user: publicMetadata.user,
        },
        null,
      );

      await this.invalidateUserAccessCaches(publicMetadata.user);
      return;
    }

    const selectedBrand = await this.brandsService.selectBrandForUser(
      selectedBrandId,
      publicMetadata.user,
      publicMetadata.organization,
    );

    await this.membersService.setLastUsedBrand(
      {
        isActive: true,
        isDeleted: false,
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      },
      selectedBrand.id,
    );

    await this.invalidateUserAccessCaches(publicMetadata.user);
  }

  @Get()
  @SetMetadata('roles', ['superadmin'])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @Query() query: BaseQueryDto,
  ): Promise<unknown> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const data = await this.usersService.findAll(
      {
        orderBy: handleQuerySort(query.sort),
        where: { isDeleted },
      },
      options,
    );
    return serializeCollection(request, UserSerializer, data);
  }

  @Get('me')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findMe(@Req() request: Request, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    const subscriptionStatus = getStripeSubscriptionStatus(user, request);
    const userId = publicMetadata.user;
    const organizationId = publicMetadata.organization;

    let dbSubscription = await this.subscriptionsService.findOne({
      isDeleted: false,
      user: userId,
    });

    if (!dbSubscription && /^[0-9a-f]{24}$/i.test(organizationId)) {
      dbSubscription = await this.subscriptionsService.findOne({
        isDeleted: false,
        organization: organizationId,
      });
    }

    const hasActiveDbSubscription = this.isActiveSubscriptionStatus(
      dbSubscription?.status,
    );

    const hasAccessByEntitlement =
      getIsSuperAdmin(user, request) ||
      subscriptionStatus === SubscriptionStatus.ACTIVE ||
      subscriptionStatus === SubscriptionStatus.TRIALING ||
      getSubscriptionTier(user, request) === SubscriptionTier.BYOK ||
      hasActiveDbSubscription;

    let data = await this.usersService.findOne({
      _id: userId,
      isDeleted: false,
    });

    if (!data) {
      return returnNotFound(this.constructorName, publicMetadata.user);
    }

    // Auto-complete onboarding for records missing the onboarding flag
    // and for entitled users whose DB onboarding flag fell out of sync.
    if (!data.isOnboardingCompleted) {
      const hasField = await this.usersService.hasOnboardingField(data.id);

      if (!hasField || hasAccessByEntitlement) {
        data = await this.usersService.patch(data.id.toString(), {
          isOnboardingCompleted: true,
          onboardingStepsCompleted: ['brand', 'providers', 'summary'],
        });

        const userIdString = data.id?.toString();
        if (userIdString) {
          await this.invalidateUserAccessCaches(userIdString);
        }
      }
    }

    return serializeSingle(request, UserSerializer, data);
  }

  @Post('me/avatar')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getAvatarUploadUrl(
    @CurrentUser() user: User,
    @Body() body: { contentType: string },
  ) {
    const publicMetadata = getPublicMetadata(user);
    const key = `${publicMetadata.organization}/${publicMetadata.user}-${Date.now()}`;

    const { uploadUrl, publicUrl, s3Key } =
      await this.filesClientService.getPresignedUploadUrl(
        key,
        'avatars',
        body.contentType,
      );

    return { publicUrl, s3Key, uploadUrl };
  }

  @Patch('me')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateMe(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const hasSelectedBrandPatch = Object.hasOwn(
      updateUserDto,
      'selectedBrandId',
    );
    const { selectedBrandId, ...userPatchDto } = updateUserDto;

    // Completing onboarding is a cascade, not a plain field write: it records
    // the completion state and invalidates access caches so OnboardingGuard
    // sees the new state on the next request.
    if (userPatchDto.isOnboardingCompleted === true) {
      const completed = await this.completeOnboardingFunnel(request, user);
      return completed;
    }

    if (hasSelectedBrandPatch) {
      if (
        selectedBrandId !== null &&
        (typeof selectedBrandId !== 'string' || selectedBrandId.length === 0)
      ) {
        throw new BadRequestException(
          'selectedBrandId must be a brand id or null',
        );
      }

      await this.setBrandSelectionForUser(user, selectedBrandId);
    }

    const hasUserPatch = Object.keys(userPatchDto).length > 0;
    const data = hasUserPatch
      ? await this.usersService.patch(publicMetadata.user, userPatchDto)
      : await this.usersService.findOne({
          _id: publicMetadata.user,
          isDeleted: false,
        });

    return data
      ? serializeSingle(request, UserSerializer, data)
      : returnNotFound(this.constructorName, publicMetadata.user);
  }

  /**
   * First-asset unlock gate — persist the per-user "explore anyway" escape hatch.
   * Invalidates the access caches so the next `/auth/bootstrap` reflects the new
   * `hasDismissedAssetGate` immediately (the payload is Redis-cached ~30s), which
   * is what lets the client clear the locked nav/overlay without a stale window.
   */
  // Internal UI-only escape hatch — excluded from the OpenAPI documentation:
  // it persists a client preference rather than a public API operation.
  @ApiExcludeEndpoint()
  @Patch('me/asset-gate')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateMeAssetGate(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() updateAssetGateDto: UpdateAssetGateDto,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const data = await this.usersService.patch(publicMetadata.user, {
      hasDismissedAssetGate: updateAssetGateDto.hasDismissedAssetGate,
    } as Partial<UpdateUserDto>);

    await this.invalidateUserAccessCaches(publicMetadata.user);

    return data
      ? serializeSingle(request, UserSerializer, data)
      : returnNotFound(this.constructorName, publicMetadata.user);
  }

  /**
   * Idempotent onboarding-funnel completion. Patches the User row only when not
   * already completed, invalidates the access caches so `OnboardingGuard` sees
   * the new state on the next request.
   */
  private async completeOnboardingFunnel(request: Request, user: User) {
    const publicMetadata = getPublicMetadata(user);
    const canonicalUserId = publicMetadata.user || user.id;

    const dbUser = await this.usersService.findOne({
      _id: canonicalUserId,
      isDeleted: false,
    });

    if (!dbUser?.id) {
      throw new UnauthorizedException('User account not found');
    }

    if (!dbUser.isOnboardingCompleted) {
      await this.usersService.patch(dbUser.id, {
        isOnboardingCompleted: true,
        onboardingCompletedAt: new Date(),
        onboardingStepsCompleted: ['brand', 'providers', 'summary'],
      } as Partial<UpdateUserDto>);
    }

    const dbUserId = dbUser.id.toString();
    await this.invalidateUserAccessCaches(dbUserId);

    const completed = await this.usersService.findOne({
      _id: dbUserId,
      isDeleted: false,
    });

    return completed
      ? serializeSingle(request, UserSerializer, completed)
      : returnNotFound(this.constructorName, publicMetadata.user);
  }

  @Get(':userId/onboarding')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async getOnboardingStatus(
    @Req() request: Request,
    @CurrentUser() currentUser: User,
    @Param('userId') userId: string,
  ) {
    if (!this.canAccessUser(userId, currentUser)) {
      return returnNotFound(this.constructorName, userId);
    }

    const data = await this.usersService.findOne({
      _id: userId,
      isDeleted: false,
    });

    if (!data) {
      return returnNotFound(this.constructorName, userId);
    }

    return serializeSingle(request, UserSerializer, data);
  }

  @Patch(':userId/onboarding')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateOnboardingStatus(
    @Req() request: Request,
    @CurrentUser() currentUser: User,
    @Param('userId') userId: string,
    @Body() updateOnboardingDto: UpdateUserOnboardingDto,
  ) {
    if (!this.canAccessUser(userId, currentUser)) {
      return returnNotFound(this.constructorName, userId);
    }

    const existingUser = await this.usersService.findOne({
      _id: userId,
      isDeleted: false,
    });

    if (!existingUser) {
      return returnNotFound(this.constructorName, userId);
    }

    const patchPayload: Record<string, unknown> = {
      ...updateOnboardingDto,
    };

    const hasOnboardingSignal =
      updateOnboardingDto.onboardingType !== undefined ||
      updateOnboardingDto.onboardingStepsCompleted !== undefined ||
      updateOnboardingDto.isOnboardingCompleted !== undefined;

    if (!existingUser.onboardingStartedAt && hasOnboardingSignal) {
      patchPayload.onboardingStartedAt = new Date();
    }

    if (
      updateOnboardingDto.isOnboardingCompleted &&
      !updateOnboardingDto.onboardingCompletedAt
    ) {
      patchPayload.onboardingCompletedAt = new Date();
    }

    const data = await this.usersService.patch(
      userId,
      patchPayload as Partial<UpdateUserDto>,
    );

    const existingUserId = existingUser.id?.toString();
    if (existingUserId) {
      await this.invalidateUserAccessCaches(existingUserId);
    }

    return data
      ? serializeSingle(request, UserSerializer, data)
      : returnNotFound(this.constructorName, userId);
  }

  @Get(':userId')
  @SetMetadata('roles', ['superadmin'])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findOne(@Req() request: Request, @Param('userId') userId: string) {
    const data = await this.usersService.findOne({
      _id: userId,
      isDeleted: false,
    });
    return data
      ? serializeSingle(request, UserSerializer, data)
      : returnNotFound(this.constructorName, userId);
  }
}
