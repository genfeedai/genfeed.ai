import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ActivitiesQueryDto } from '@api/collections/activities/dto/activities-query.dto';
import { BulkUpdateActivitiesDto } from '@api/collections/activities/dto/bulk-update-activities.dto';
import { UpdateActivityDto } from '@api/collections/activities/dto/update-activity.dto';
import { type ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
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
  @RolesDecorator('superadmin')
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAll(
    @Req() request: Request,
    @Query() query: ActivitiesQueryDto,
  ): Promise<JsonApiCollectionResponse> {
    const options = {
      customLabels,
      ...QueryDefaultsUtil.getPaginationDefaults(query),
    };

    const isDeleted = QueryDefaultsUtil.getIsDeletedDefault(query.isDeleted);

    const aggregate = {
      where: { isDeleted },
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
    const publicMetadata = getPublicMetadata(user);

    // Find and verify ownership
    const activity = await this.activitiesService.findOne({
      _id: activityId,
      OR: [
        { user: publicMetadata.user },
        { organization: publicMetadata.organization },
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
    const publicMetadata = getPublicMetadata(user);

    const { ids, isRead, isDeleted } = bulkUpdateDto;

    // Single scoped partition query + a single batched write, regardless of
    // how many ids the caller supplies. Ids the caller may not touch (missing,
    // already soft-deleted, or owned by another user AND another organization)
    // come back in `failed`, matching the previous per-id permission check.
    const { failed, updated } = await this.activitiesService.bulkUpdateScoped({
      ids,
      ...(typeof isDeleted === 'boolean' ? { isDeleted } : {}),
      ...(typeof isRead === 'boolean' ? { isRead } : {}),
      organizationId: publicMetadata.organization.toString(),
      userId: publicMetadata.user.toString(),
    });

    if (failed.length > 0) {
      this.loggerService.warn(`${url} skipped inaccessible activities`, {
        count: failed.length,
        orgId: publicMetadata.organization,
        userId: publicMetadata.user,
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
