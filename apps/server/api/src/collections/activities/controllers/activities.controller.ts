import type { ActivitiesQueryDto } from '@api/collections/activities/dto/activities-query.dto';
import type { BulkUpdateActivitiesDto } from '@api/collections/activities/dto/bulk-update-activities.dto';
import type { UpdateActivityDto } from '@api/collections/activities/dto/update-activity.dto';
import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { RolesDecorator } from '@api/helpers/decorators/roles/roles.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { customLabels } from '@api/helpers/utils/pagination/pagination.util';
import { QueryDefaultsUtil } from '@api/helpers/utils/query-defaults/query-defaults.util';
import {
  returnNotFound,
  serializeCollection,
  serializeSingle,
} from '@api/helpers/utils/response/response.util';
import { handleQuerySort } from '@api/helpers/utils/sort/sort.util';
import type { AggregatePaginateResult } from '@api/types/mongoose-aggregate-paginate-v2';
import type { User } from '@clerk/backend';
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
import { type PipelineStage, Types } from 'mongoose';

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

    const aggregate: PipelineStage[] = [
      {
        $match: { isDeleted },
      },
      ...ActivitiesService.buildEntityLookup(),
      {
        $sort: query.sort
          ? handleQuerySort(query.sort)
          : ({ createdAt: -1, key: 1 } as SortObject),
      },
    ];

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
      $or: [
        { user: new Types.ObjectId(publicMetadata.user) },
        { organization: new Types.ObjectId(publicMetadata.organization) },
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

    const updated: string[] = [];
    const failed: string[] = [];

    const { ids, isRead, isDeleted } = bulkUpdateDto;

    // Process each ID for update
    for (const id of ids) {
      try {
        // Find the activity and check permissions
        const activity = await this.activitiesService.findOne({
          _id: id,
          isDeleted: false,
        });

        if (!activity) {
          failed.push(id);
          continue;
        }

        // Check if user has permission to update
        // User must be the owner or in the same organization
        const isOwner =
          publicMetadata.user.toString() === activity.user.toString();

        const isSameOrg =
          publicMetadata.organization.toString() ===
          activity.organization.toString();

        if (!isOwner && !isSameOrg) {
          this.loggerService.warn(`${url} permission denied`, {
            activityId: id,
            orgId: publicMetadata.organization,
            userId: publicMetadata.user,
          });

          failed.push(id);
          continue;
        }

        // Update the activity
        const updateData: Record<string, boolean> = {};
        if (typeof isRead === 'boolean') {
          updateData.isRead = isRead;
        }
        if (typeof isDeleted === 'boolean') {
          updateData.isDeleted = isDeleted;
        }

        await this.activitiesService.patch(id, updateData);
        updated.push(id);

        this.loggerService.log(`${url} updated activity`, { id });
      } catch (error: unknown) {
        this.loggerService.error(`${url} failed to update activity`, {
          error,
          id,
        });
        failed.push(id);
      }
    }

    const totalRequested = bulkUpdateDto.ids.length;
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
