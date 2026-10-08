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
  readObjectRecord,
} from '@api/collections/users/controllers/users-relationships.helpers';
import { ProductEmailTopicDto } from '@api/collections/users/dto/product-email-topic.dto';
import { UpdateWorkflowEmailNotificationPreferenceDto } from '@api/collections/users/dto/update-workflow-email-notification-preference.dto';
import { UsersService } from '@api/collections/users/services/users.service';
import { UserAccessCacheService } from '@api/common/services/user-access-cache.service';
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
import { NotificationPreferenceService } from '@api/services/notifications/workflow-notifications/notification-preference.service';
import { AGENT_STATUS_NOTIFICATION_TOPIC } from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
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
  ForbiddenException,
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

  @Get('me/notification-preferences/agent-status/email')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'UsersController.findAgentEmailNotificationPreference',
    summary: 'findAgentEmailNotificationPreference',
  })
  async findAgentEmailNotificationPreference(
    @Req() request: Request,
    @CurrentUser() user: User,
  ) {
    const data = await this.notificationPreferenceService.findForUser(
      user.userId ?? user.id,
      AGENT_STATUS_NOTIFICATION_TOPIC,
    );
    return serializeSingle(request, NotificationPreferenceSerializer, data);
  }

  @Patch('me/notification-preferences/agent-status/email')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  @ApiOperation({
    operationId: 'UsersController.updateAgentEmailNotificationPreference',
    summary: 'updateAgentEmailNotificationPreference',
  })
  async updateAgentEmailNotificationPreference(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Body() dto: UpdateWorkflowEmailNotificationPreferenceDto,
  ) {
    const data = await this.notificationPreferenceService.setForUser(
      user.userId ?? user.id,
      dto.isEnabled,
      AGENT_STATUS_NOTIFICATION_TOPIC,
    );
    return serializeSingle(request, NotificationPreferenceSerializer, data);
  }

  @Get('me/notification-preferences/product/:topic/email')
  async findProductEmailPreference(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param() params: ProductEmailTopicDto,
  ) {
    const data = await this.notificationPreferenceService.findForUser(
      user.userId ?? user.id,
      params.topic,
    );
    return serializeSingle(request, NotificationPreferenceSerializer, data);
  }

  @Patch('me/notification-preferences/product/:topic/email')
  async updateProductEmailPreference(
    @Req() request: Request,
    @CurrentUser() user: User,
    @Param() params: ProductEmailTopicDto,
    @Body() dto: UpdateWorkflowEmailNotificationPreferenceDto,
  ) {
    const data = await this.notificationPreferenceService.setForUser(
      user.userId ?? user.id,
      dto.isEnabled,
      params.topic,
    );
    return serializeSingle(request, NotificationPreferenceSerializer, data);
  }

  @Get('me/brands')
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
    const tenant = CollectionFilterUtil.resolveListOrganizationId(
      query,
      user,
      request,
    );
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };
    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    let member: { brands?: string[] } | null = null;
    try {
      member = (await this.membersService.findOne({
        organizationId: tenant.organizationId,
        userId: user.userId ?? user.id,
        isDeleted: false,
      })) as { brands?: string[] } | null;
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} findAll: Failed to fetch member`,
        error,
      );
      member = null;
    }

    const authorizedWhere =
      await this.brandsService.brandAccessService.predicate(user);
    const data = await this.brandsService.findAll(
      {
        include: { credentials: true },
        orderBy: handleQuerySort(query.sort),
        where: {
          AND: [
            authorizedWhere,
            buildMeBrandsWhere({
              isDeleted,
              isSuperAdmin: getIsSuperAdmin(user, request),
              memberBrandIds: member?.brands,
              organizationId: tenant.organizationId,
            }),
          ],
        },
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

    return serializeSingle(
      request,
      SettingSerializer,
      await this.settingsService.withLiveFavoriteWorkflowIds(
        settings,
        user.organizationId,
      ),
    );
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

    return this.patchSettingsForCaller(
      request,
      settingsId,
      updateSettingDto,
      user,
      user.userId ?? user.id,
    );
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
      user,
    );

    if (user.userId ?? user.id) {
      await this.userAccessCacheService.invalidateAll(user.userId ?? user.id);
    }

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
    @CurrentUser() currentUser: User,
    @Param('userId') userId: string,
    @Body() updateSettingDto: UpdateSettingDto,
  ) {
    if (
      !getIsSuperAdmin(currentUser, request) &&
      (currentUser.userId ?? currentUser.id) !== userId
    ) {
      throw new ForbiddenException('Cannot update settings for another user');
    }

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

    return this.patchSettingsForCaller(
      request,
      settingsId,
      updateSettingDto,
      currentUser,
      userId,
    );
  }

  /**
   * Favorite workflow ids are validated against the caller's organization
   * before anything is written and replace only that organization's subset of
   * the stored list, under a settings-row lock. The response carries only the
   * caller org's live favorites.
   */
  private async patchSettingsForCaller(
    request: Request,
    settingsId: string,
    updateSettingDto: UpdateSettingDto,
    caller: User,
    targetUserId: string,
  ) {
    // `null` passes the optional DTO validator; the service rejects it.
    const data =
      updateSettingDto.favoriteWorkflowIds === undefined
        ? await this.settingsService.patch(
            settingsId,
            new SettingEntity({ ...updateSettingDto }),
          )
        : await this.settingsService.patchWithFavoriteWorkflowIds(
            settingsId,
            updateSettingDto,
            caller.organizationId,
          );

    if (!data) {
      return returnNotFound(this.constructorName, targetUserId);
    }

    await this.userAccessCacheService.invalidateAll(targetUserId);

    return serializeSingle(
      request,
      SettingSerializer,
      await this.settingsService.withLiveFavoriteWorkflowIds(
        data,
        caller.organizationId,
      ),
    );
  }

  private async findUserSettings(userData: unknown): Promise<object | null> {
    const nestedSettings = readObjectRecord(nestedSettingsRecord(userData));
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
