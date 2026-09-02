import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesQueryDto } from '@api/collections/activities/dto/activities-query.dto';
import { BulkUpdateActivitiesDto } from '@api/collections/activities/dto/bulk-update-activities.dto';
import { UpdateActivityDto } from '@api/collections/activities/dto/update-activity.dto';
import { type ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
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
import { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import type {
  JsonApiCollectionResponse,
  JsonApiSingleResponse,
  SortObject,
} from '@genfeedai/interfaces';
import { ActivitySerializer } from '@genfeedai/serializers';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
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
import type { Request } from 'express';

@AutoSwagger()
@Controller('activities')
@UseGuards(RolesGuard)
export class ActivitiesController {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,
    private readonly activitiesService: ActivitiesService,
  ) {}

  @Get()
  // Members list activities scoped by brand/org (preferred over nested duals).
  // Superadmins without filters still see all non-deleted activities.
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @Query() query: ActivitiesQueryDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);
    const where: Record<string, unknown> = { isDeleted };
    const isSuperAdmin = getIsSuperAdmin(user, request);
    const hasExplicitTenantFilter = Boolean(
      query.brandId || query.organizationId,
    );

    if (hasExplicitTenantFilter) {
      const scope = CollectionFilterUtil.resolveAuthorizedTenantQuery(
        query,
        user,
        isSuperAdmin,
      );
      if (scope.brandId) {
        where.brandId = scope.brandId;
      }
      // Always keep a tenant boundary for non-superadmin explicit filters.
      if (scope.organizationId) {
        where.organizationId = scope.organizationId;
      } else if (!isSuperAdmin && (user.userId ?? user.id)) {
        where.userId = user.userId ?? user.id;
      }
    } else if (!isSuperAdmin) {
      // Default member scope: active brand, else org ownership OR.
      if (user.brandId) {
        where.brandId = user.brandId;
      } else if (user.organizationId) {
        where.OR = [
          { userId: user.userId ?? user.id },
          { organizationId: user.organizationId },
        ];
      } else {
        where.userId = user.userId ?? user.id;
      }
    }

    const aggregate = {
      where,
      orderBy: query.sort
        ? handleQuerySort(query.sort)
        : ({ createdAt: -1, key: 1 } as SortObject),
    };

    const data: AggregatePaginateResult<ActivityDocument> =
      await this.activitiesService.findAll(aggregate, options);
    return serializeCollection(request, ActivitySerializer, data);
  }

  @Patch(':activityId')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async update(
    @Req() request: Request,
    @Param('activityId') activityId: string,
    @Body() updateActivityDto: UpdateActivityDto,
    @CurrentUser() user: User,
  ): Promise<JsonApiSingleResponse> {
    // Find and verify ownership
    const activity = await this.activitiesService.findOne({
      id: activityId,
      OR: [
        { userId: user.userId ?? user.id },
        { organizationId: user.organizationId },
      ],
    });

    if (!activity) {
      return returnNotFound(this.constructorName, activityId);
    }

    const data: ActivityDocument = await this.activitiesService.patch(
      activityId,
      updateActivityDto,
    );
    return serializeSingle(request, ActivitySerializer, data);
  }

  @Patch()
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async bulkUpdate(
    @Req() request: Request,
    @Body() bulkUpdateDto: BulkUpdateActivitiesDto,
    @CurrentUser() user: User,
  ): Promise<{ updated: string[]; failed: string[]; message: string }> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const { ids, isRead, isDeleted } = bulkUpdateDto;

    // Single scoped partition query + a single batched write, regardless of
    // how many ids the caller supplies. Ids the caller may not touch (missing,
    // already soft-deleted, or owned by another user AND another organization)
    // come back in `failed`, matching the previous per-id permission check.
    const { failed, updated } = await this.activitiesService.bulkUpdateScoped({
      ids,
      ...(typeof isDeleted === 'boolean' ? { isDeleted } : {}),
      ...(typeof isRead === 'boolean' ? { isRead } : {}),
      organizationId: user.organizationId.toString(),
      userId: (user.userId ?? user.id).toString(),
    });

    if (failed.length > 0) {
      this.loggerService.warn(`${url} skipped inaccessible activities`, {
        count: failed.length,
        orgId: user.organizationId,
        userId: user.userId ?? user.id,
      });
    }

    const totalRequested = ids.length;
    const totalUpdated = updated.length;
    const totalFailed = failed.length;

    this.loggerService.log(`${url} completed`, {
      failed: totalFailed,
      totalRequested,
      updated: totalUpdated,
    });

    return {
      failed,
      message: `Updated ${totalUpdated} of ${totalRequested} activities`,
      updated,
    };
  }
}
