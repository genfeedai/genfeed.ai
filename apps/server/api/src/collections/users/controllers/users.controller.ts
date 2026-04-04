import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UpdateSettingDto } from '@api/collections/settings/dto/update-setting.dto';
import { SettingEntity } from '@api/collections/settings/entities/setting.entity';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UpdateUserDto } from '@api/collections/users/dto/update-user.dto';
import { UpdateUserOnboardingDto } from '@api/collections/users/dto/update-user-onboarding.dto';
import { UserEntity } from '@api/collections/users/entities/user.entity';
import type { UserDocument } from '@api/collections/users/schemas/user.schema';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { BrandFilterUtil } from '@api/helpers/utils/brand-filter/brand-filter.util';
import {
  getIsSuperAdmin,
  getPublicMetadata,
  getStripeSubscriptionStatus,
  getSubscriptionTier,
} from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import type { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
import {
  BrandSerializer,
  OrganizationSerializer,
  SettingSerializer,
  UserSerializer,
} from '@genfeedai/serializers';
import { SubscriptionStatus, SubscriptionTier } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { type PipelineStage, Types } from 'mongoose';

@AutoSwagger()
@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly brandsService: BrandsService,
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly organizationsService: OrganizationsService,
    private readonly settingsService: SettingsService,
    private readonly clerkService: ClerkService,
    private readonly filesClientService: FilesClientService,
    private readonly loggerService: LoggerService,
    private readonly membersService: MembersService,
    private readonly requestContextCacheService: RequestContextCacheService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
  ) {}

  private canAccessUser(targetUserId: string, currentUser: User): boolean {
    const publicMetadata = getPublicMetadata(currentUser);
    return getIsSuperAdmin(currentUser) || publicMetadata.user === targetUserId;
  }

  @Get()
  @SetMetadata('roles', ['superadmin'])
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @Query() query: BaseQueryDto,
  ): Promise<UserEntity[]> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: PipelineStage[] = [
      {
        $match: {
          isDeleted,
        },
      },
      {
        $lookup: {
          as: 'settings',
          foreignField: 'user',
          from: 'settings',
          localField: '_id',
        },
      },
      {
        $unwind: {
          path: '$settings',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<UserDocument> =
      await this.usersService.findAll(aggregate, options);
    return serializeCollection(request, UserSerializer, data);
  }

  @Get('me')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findMe(@Req() request: Request, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    const subscriptionStatus = getStripeSubscriptionStatus(user, request);
    const userId = new Types.ObjectId(publicMetadata.user);
    const organizationId = publicMetadata.organization;

    let dbSubscription = await this.subscriptionsService.findOne({
      isDeleted: false,
      user: userId,
    });

    if (!dbSubscription && Types.ObjectId.isValid(organizationId)) {
      dbSubscription = await this.subscriptionsService.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(organizationId),
      });
    }

    const hasActiveDbSubscription =
      dbSubscription?.status === SubscriptionStatus.ACTIVE ||
      dbSubscription?.status === SubscriptionStatus.TRIALING;

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
      const hasField = await this.usersService.hasOnboardingField(
        new Types.ObjectId(data._id),
      );

      if (!hasField || hasAccessByEntitlement) {
        data = await this.usersService.patch(data._id.toString(), {
          isOnboardingCompleted: true,
          onboardingStepsCompleted: ['brand', 'plan'],
        });

        if (user.id) {
          await Promise.all([
            this.requestContextCacheService.invalidateForUser(user.id),
            this.accessBootstrapCacheService.invalidateForUser(user.id),
          ]);
        }
      }
    }

    return serializeSingle(request, UserSerializer, data);
  }

  @Get('me/brands')
  @Cache({
    tags: ['accounts', 'users'],
    ttl: 1_800, // 30 minutes
    // keyGenerator: (user: User, query: unknown) =>
    //   `user:${user.id}:accounts:page:${query.page || 1}:limit:${query.limit || 20}`,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findMeBrands(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Query() query: BaseQueryDto,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    // Check if user is a member with restricted accounts
    let member: unknown;
    try {
      member = await this.membersService.findOne({
        isDeleted: false,
        organization: new Types.ObjectId(publicMetadata.organization),
        user: new Types.ObjectId(publicMetadata.user),
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} findAll: Failed to fetch member`,
        error,
      );
      // Continue without member restrictions if fetch fails
      member = null;
    }

    const brandFilter: unknown = {
      isDeleted,
      organization: new Types.ObjectId(publicMetadata.organization),
    };

    if (
      member?.brands &&
      member.brands.length > 0 &&
      !getIsSuperAdmin(user, request)
    ) {
      brandFilter._id = { $in: member.brands };
    }

    const aggregate: PipelineStage[] = [
      {
        $match: brandFilter,
      },
      // Lookup brand assets (logo, credentials) using BrandFilterUtil
      ...BrandFilterUtil.buildBrandAssetLookups({
        includeBanner: false,
        includeCredentials: true,
        includeLogo: true,
        includeReferences: false,
      }),
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<BrandDocument> =
      await this.brandsService.findAll(aggregate, options);
    return serializeCollection(request, BrandSerializer, data);
  }

  @Get('me/settings')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findMeSettings(@Req() request: Request, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);

    const userData = await this.usersService.findOne({
      _id: new Types.ObjectId(publicMetadata.user),
      isDeleted: false,
    });

    if (!userData || !userData.settings) {
      return returnNotFound('Settings', publicMetadata.user);
    }

    return serializeSingle(request, SettingSerializer, userData.settings);
  }

  @Patch('me/settings')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateMeSettings(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() updateSettingDto: UpdateSettingDto,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const userData = await this.usersService.findOne({
      _id: new Types.ObjectId(publicMetadata.user),
      isDeleted: false,
    });

    if (!userData || !userData.settings) {
      return returnNotFound('Settings', publicMetadata.user);
    }

    const data = await this.settingsService.patch(
      userData.settings._id,
      new SettingEntity({ ...updateSettingDto }),
    );

    return data
      ? serializeSingle(request, SettingSerializer, data)
      : returnNotFound(this.constructorName, publicMetadata.user);
  }

  @Get('me/organizations')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findMeOrganizations(
    @CurrentUser() user: User,
    @Req() request: Request,
    @Query() query: BaseQueryDto,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const aggregate: PipelineStage[] = [
      {
        $match: {
          isDeleted,
          user: new Types.ObjectId(publicMetadata.user),
        },
      },
      {
        $sort: handleQuerySort(query.sort),
      },
    ];

    const data: AggregatePaginateResult<OrganizationDocument> =
      await this.organizationsService.findAll(aggregate, options);
    return serializeCollection(request, OrganizationSerializer, data);
  }

  // Only used to update the isSelected field of the brand
  @Patch('me/organizations/:organizationId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateOrganizationSelection(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('organizationId') organizationId: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organization = await this.organizationsService.findOne({
      _id: new Types.ObjectId(organizationId),
      isDeleted: false,
      user: new Types.ObjectId(publicMetadata.user),
    });

    if (!organization) {
      return returnNotFound('Organization', organizationId);
    }

    const data = await this.organizationsService.patch(organizationId, {
      isSelected: true,
    });

    // Update Clerk public metadata to reflect the selected brand
    await this.clerkService.updateUserPublicMetadata(user.id, {
      organization: data._id,
    });

    await Promise.all([
      this.requestContextCacheService.invalidateForUser(user.id),
      this.accessBootstrapCacheService.invalidateForUser(user.id),
    ]);

    return serializeSingle(request, OrganizationSerializer, data);
  }

  // Only used to update the isSelected field of the brand
  @Patch('me/brands/:brandId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateBrandSelection(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
  ) {
    const publicMetadata = getPublicMetadata(user);

    // Use atomic operation to prevent race condition
    const data = await this.brandsService.selectBrandForUser(
      brandId,
      publicMetadata.user,
      publicMetadata.organization,
    );

    // Update Clerk public metadata to reflect the selected brand
    await this.clerkService.updateUserPublicMetadata(user.id, {
      brand: data._id,
    });

    await Promise.all([
      this.requestContextCacheService.invalidateForUser(user.id),
      this.accessBootstrapCacheService.invalidateForUser(user.id),
    ]);

    // Persist last-used brand on the member for org-switch recall
    await this.membersService.setLastUsedBrand(
      {
        isActive: true,
        isDeleted: false,
        organization: new Types.ObjectId(publicMetadata.organization),
        user: new Types.ObjectId(publicMetadata.user),
      },
      data._id,
    );

    return serializeSingle(request, BrandSerializer, data);
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

  @Post('me/avatar/confirm')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async confirmAvatarUpload(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() body: { publicUrl: string },
  ) {
    const publicMetadata = getPublicMetadata(user);

    const data = await this.usersService.patch(publicMetadata.user, {
      avatar: body.publicUrl,
    });

    return data
      ? serializeSingle(request, UserSerializer, data)
      : returnNotFound(this.constructorName, publicMetadata.user);
  }

  @Patch('me')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateMe(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    const publicMetadata = getPublicMetadata(user);

    const data = await this.usersService.patch(
      publicMetadata.user,
      updateUserDto,
    );

    return data
      ? serializeSingle(request, UserSerializer, data)
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

    if (existingUser.clerkId) {
      await Promise.all([
        this.requestContextCacheService.invalidateForUser(existingUser.clerkId),
        this.accessBootstrapCacheService.invalidateForUser(
          existingUser.clerkId,
        ),
      ]);
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

  @Patch(':userId/settings')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async updateSettings(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Body() updateSettingDto: UpdateSettingDto,
  ) {
    const user = await this.usersService.findOne({
      _id: userId,
      isDeleted: false,
    });

    if (!user || !user.settings) {
      return returnNotFound(this.constructorName, userId);
    }

    const data = await this.settingsService.patch(
      user.settings._id,
      new SettingEntity({ ...updateSettingDto }),
    );

    return data
      ? serializeSingle(request, SettingSerializer, data)
      : returnNotFound(this.constructorName, userId);
  }
}
