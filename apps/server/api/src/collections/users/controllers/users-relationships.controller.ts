import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UpdateSettingDto } from '@api/collections/settings/dto/update-setting.dto';
import { SettingEntity } from '@api/collections/settings/entities/setting.entity';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BetterAuthIdentityCacheService } from '@api/common/services/better-auth-identity-cache.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import {
  getIsSuperAdmin,
  getPublicMetadata,
} from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import {
  BrandSerializer,
  OrganizationSerializer,
  SettingSerializer,
} from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@Controller('users')
@UseGuards(RolesGuard)
export class UsersRelationshipsController {
  private readonly constructorName = 'UsersController';

  constructor(
    private readonly brandsService: BrandsService,
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
    private readonly settingsService: SettingsService,
    private readonly loggerService: LoggerService,
    private readonly membersService: MembersService,
    private readonly requestContextCacheService: RequestContextCacheService,
    private readonly accessBootstrapCacheService: AccessBootstrapCacheService,
    private readonly betterAuthIdentityCacheService: BetterAuthIdentityCacheService,
  ) {}

  @Get('me/brands')
  @Cache({
    tags: ['accounts', 'users'],
    ttl: 1_800,
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'UsersController.findMeBrands',
    summary: 'findMeBrands',
  })
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

    let member: { brands?: string[] } | null = null;
    try {
      member = (await this.membersService.findOne({
        isDeleted: false,
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      })) as { brands?: string[] } | null;
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} findAll: Failed to fetch member`,
        error,
      );
      member = null;
    }

    const brandFilter: Record<string, unknown> = {
      isDeleted,
      organization: publicMetadata.organization,
    };

    if (
      member?.brands &&
      member.brands.length > 0 &&
      !getIsSuperAdmin(user, request)
    ) {
      brandFilter._id = { in: member.brands };
    }

    const data = await this.brandsService.findAll(
      {
        include: { credentials: true },
        orderBy: handleQuerySort(query.sort),
        where: brandFilter,
      },
      options,
    );
    return serializeCollection(request, BrandSerializer, data);
  }

  @Get('me/settings')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'UsersController.findMeSettings',
    summary: 'findMeSettings',
  })
  async findMeSettings(@Req() request: Request, @CurrentUser() user: User) {
    const publicMetadata = getPublicMetadata(user);
    const userData = await this.usersService.findOne({
      _id: publicMetadata.user,
      isDeleted: false,
    });
    const settings = await this.findUserSettings(userData);

    if (!userData || !settings) {
      return returnNotFound('Settings', publicMetadata.user);
    }

    return serializeSingle(request, SettingSerializer, settings);
  }

  @Patch('me/settings')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'UsersController.updateMeSettings',
    summary: 'updateMeSettings',
  })
  async updateMeSettings(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() updateSettingDto: UpdateSettingDto,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const userData = await this.usersService.findOne({
      _id: publicMetadata.user,
      isDeleted: false,
    });
    const settings = await this.findUserSettings(userData);

    if (!userData || !settings) {
      return returnNotFound('Settings', publicMetadata.user);
    }

    const settingsId = this.getSettingsId(settings);
    if (!settingsId) {
      return returnNotFound('Settings', publicMetadata.user);
    }

    const data = await this.settingsService.patch(
      settingsId,
      new SettingEntity({ ...updateSettingDto }),
    );

    return data
      ? serializeSingle(request, SettingSerializer, data)
      : returnNotFound(this.constructorName, publicMetadata.user);
  }

  @Get('me/organizations')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'UsersController.findMeOrganizations',
    summary: 'findMeOrganizations',
  })
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
    const data = await this.organizationsService.findAll(
      {
        orderBy: handleQuerySort(query.sort),
        where: {
          isDeleted,
          user: publicMetadata.user,
        },
      },
      options,
    );
    return serializeCollection(request, OrganizationSerializer, data);
  }

  @Patch('me/organizations/:organizationId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'UsersController.updateOrganizationSelection',
    summary: 'updateOrganizationSelection',
  })
  async updateOrganizationSelection(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('organizationId') organizationId: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const organization = await this.organizationsService.findOne({
      _id: organizationId,
      isDeleted: false,
      user: publicMetadata.user,
    });

    if (!organization) {
      return returnNotFound('Organization', organizationId);
    }

    const data = await this.organizationsService.patch(organizationId, {
      isSelected: true,
    });

    if (publicMetadata.user) {
      await this.usersService.patch(publicMetadata.user, {
        lastUsedOrganizationId: String(data.id),
      });
      await this.invalidateUserAccessCaches(publicMetadata.user);
    }

    return serializeSingle(request, OrganizationSerializer, data);
  }

  @Patch('me/brands/:brandId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'UsersController.updateBrandSelection',
    summary: 'updateBrandSelection',
  })
  async updateBrandSelection(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param('brandId') brandId: string,
  ) {
    const publicMetadata = getPublicMetadata(user);
    const data = await this.brandsService.selectBrandForUser(
      brandId,
      publicMetadata.user,
      publicMetadata.organization,
    );

    if (publicMetadata.user) {
      await this.invalidateUserAccessCaches(publicMetadata.user);
    }

    await this.membersService.setLastUsedBrand(
      {
        isActive: true,
        isDeleted: false,
        organization: publicMetadata.organization,
        user: publicMetadata.user,
      },
      data.id,
    );

    return serializeSingle(request, BrandSerializer, data);
  }

  @Patch(':userId/settings')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'UsersController.updateSettings',
    summary: 'updateSettings',
  })
  async updateSettings(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Body() updateSettingDto: UpdateSettingDto,
  ) {
    const user = await this.usersService.findOne({
      _id: userId,
      isDeleted: false,
    });
    const settings = await this.findUserSettings(user);

    if (!user || !settings) {
      return returnNotFound(this.constructorName, userId);
    }

    const settingsId = this.getSettingsId(settings);
    if (!settingsId) {
      return returnNotFound(this.constructorName, userId);
    }

    const data = await this.settingsService.patch(
      settingsId,
      new SettingEntity({ ...updateSettingDto }),
    );

    return data
      ? serializeSingle(request, SettingSerializer, data)
      : returnNotFound(this.constructorName, userId);
  }

  private readObjectRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};
  }

  private getSettingsId(settings: unknown): string | undefined {
    const record = this.readObjectRecord(settings);
    for (const key of ['id', '_id', 'mongoId'] as const) {
      const value = record[key];

      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }

    return undefined;
  }

  private getUserIdCandidates(userData: unknown): string[] {
    const record = this.readObjectRecord(userData);
    const candidates = ['id', '_id', 'mongoId']
      .map((key) => record[key])
      .filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      );

    return [...new Set(candidates)];
  }

  private async findUserSettings(userData: unknown): Promise<unknown | null> {
    const record = this.readObjectRecord(userData);

    if (this.getSettingsId(record.settings)) {
      return record.settings;
    }

    for (const userId of this.getUserIdCandidates(userData)) {
      const settings = await this.settingsService.findOne({
        isDeleted: false,
        user: userId,
      });

      if (settings) {
        return settings;
      }
    }

    return null;
  }

  private async invalidateUserAccessCaches(userId: string): Promise<void> {
    await Promise.all([
      this.requestContextCacheService.invalidateForUser(userId),
      this.accessBootstrapCacheService.invalidateForUser(userId),
      this.betterAuthIdentityCacheService.invalidateForUser(userId),
    ]);
  }
}
