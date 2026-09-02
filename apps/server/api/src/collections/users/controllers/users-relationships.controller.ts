import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { MembersService } from '@api/collections/members/services/members.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UpdateSettingDto } from '@api/collections/settings/dto/update-setting.dto';
import { SettingEntity } from '@api/collections/settings/entities/setting.entity';
import { SettingsService } from '@api/collections/settings/services/settings.service';
import {
  buildMeBrandsWhere,
  getCanonicalId,
  nestedSettingsRecord,
} from '@api/collections/users/controllers/users-relationships.helpers';
import { UpdateWorkflowEmailNotificationPreferenceDto } from '@api/collections/users/dto/update-workflow-email-notification-preference.dto';
import { UsersService } from '@api/collections/users/services/users.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getIsSuperAdmin } from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import { NotificationPreferenceService } from '@api/services/notifications/workflow-notifications/notification-preference.service';
import {
  BrandSerializer,
  NotificationPreferenceSerializer,
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
    private readonly userAccessCacheService: UserAccessCacheService,
    private readonly notificationPreferenceService: NotificationPreferenceService,
  ) {}

  @Get('me/notification-preferences/workflow-status/email')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'UsersController.findWorkflowEmailNotificationPreference',
    summary: 'findWorkflowEmailNotificationPreference',
  })
  async findWorkflowEmailNotificationPreference(
    @Req() request: Request,
    @CurrentUser() user: User,
  ) {
    const data = await this.notificationPreferenceService.findForUser(
      user.userId ?? user.id,
    );
    return serializeSingle(request, NotificationPreferenceSerializer, data);
  }

  @Patch('me/notification-preferences/workflow-status/email')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'UsersController.updateWorkflowEmailNotificationPreference',
    summary: 'updateWorkflowEmailNotificationPreference',
  })
  async updateWorkflowEmailNotificationPreference(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: UpdateWorkflowEmailNotificationPreferenceDto,
  ) {
    const data = await this.notificationPreferenceService.setForUser(
      user.userId ?? user.id,
      dto.isEnabled,
    );
    return serializeSingle(request, NotificationPreferenceSerializer, data);
  }

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
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    let member: { brands?: string[] } | null = null;
    try {
      member = (await this.membersService.findOne({
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
      })) as { brands?: string[] } | null;
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} findAll: Failed to fetch member`,
        error,
      );
      member = null;
    }

    const data = await this.brandsService.findAll(
      {
        include: { credentials: true },
        orderBy: handleQuerySort(query.sort),
        where: buildMeBrandsWhere({
          isDeleted,
          isSuperAdmin: getIsSuperAdmin(user, request),
          memberBrandIds: member?.brands,
          organizationId: user.organizationId,
        }),
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
    const userData = await this.usersService.findOne({
      id: user.userId ?? user.id,
    });
    const settings = await this.findUserSettings(userData);

    if (!userData || !settings) {
      return returnNotFound('Settings', user.userId ?? user.id);
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
    const userData = await this.usersService.findOne({
      id: user.userId ?? user.id,
    });
    const settings = await this.findUserSettings(userData);

    if (!userData || !settings) {
      return returnNotFound('Settings', user.userId ?? user.id);
    }

    const settingsId = getCanonicalId(settings);
    if (!settingsId) {
      return returnNotFound('Settings', user.userId ?? user.id);
    }

    const data = await this.settingsService.patch(
      settingsId,
      new SettingEntity({ ...updateSettingDto }),
    );

    return data
      ? serializeSingle(request, SettingSerializer, data)
      : returnNotFound(this.constructorName, user.userId ?? user.id);
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
          userId: user.userId ?? user.id,
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
    const organization = await this.organizationsService.findOne({
      id: organizationId,
      userId: user.userId ?? user.id,
    });

    if (!organization) {
      return returnNotFound('Organization', organizationId);
    }

    const data = await this.organizationsService.patch(organizationId, {
      isSelected: true,
    });

    if (user.userId ?? user.id) {
      await this.usersService.patch(user.userId ?? user.id, {
        lastUsedOrganizationId: String(data.id),
      });
      await this.userAccessCacheService.invalidateAll(user.userId ?? user.id);
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
    const data = await this.brandsService.selectBrandForUser(
      brandId,
      user.userId ?? user.id,
      user.organizationId,
    );

    if (user.userId ?? user.id) {
      await this.userAccessCacheService.invalidateAll(user.userId ?? user.id);
    }

    await this.membersService.setLastUsedBrand(
      {
        isActive: true,
        isDeleted: false,
        organizationId: user.organizationId,
        userId: user.userId ?? user.id,
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
      id: userId,
    });
    const settings = await this.findUserSettings(user);

    if (!user || !settings) {
      return returnNotFound(this.constructorName, userId);
    }

    const settingsId = getCanonicalId(settings);
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

  private async findUserSettings(userData: unknown): Promise<unknown | null> {
    const nestedSettings = nestedSettingsRecord(userData);
    if (getCanonicalId(nestedSettings)) {
      return nestedSettings;
    }

    const userId = getCanonicalId(userData);
    if (!userId) {
      return null;
    }

    return this.settingsService.findOne({
      userId,
    });
  }
}
