import type { CreateActivityDto } from '@api/collections/activities/dto/create-activity.dto';
import type { UpdateActivityDto } from '@api/collections/activities/dto/update-activity.dto';
import {
  Activity,
  type ActivityDocument,
} from '@api/collections/activities/schemas/activity.schema';
import { StreaksService as StreaksServiceToken } from '@api/collections/streaks/services/streaks.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateModel } from '@api/types/mongoose-aggregate-paginate-v2';
import { ActivityEntityModel } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { PipelineStage } from 'mongoose';

type StreaksServiceContract = Pick<
  StreaksServiceToken,
  'checkAndUpdate' | 'isQualifyingActivityKey'
>;

@Injectable()
export class ActivitiesService extends BaseService<
  ActivityDocument,
  CreateActivityDto,
  UpdateActivityDto
> {
  constructor(
    @InjectModel(Activity.name, DB_CONNECTIONS.CLOUD)
    protected readonly model: AggregatePaginateModel<ActivityDocument>,
    public readonly logger: LoggerService,
    @Inject(forwardRef(() => StreaksServiceToken))
    private readonly streaksService: StreaksServiceContract,
  ) {
    super(model, logger);
  }

  override async create(
    createDto: CreateActivityDto,
  ): Promise<ActivityDocument> {
    const activity = await super.create(createDto);

    const activityUser = activity.user ? String(activity.user) : null;
    const activityOrganization = activity.organization
      ? String(activity.organization)
      : null;

    if (
      activityUser &&
      activityOrganization &&
      this.streaksService.isQualifyingActivityKey(activity.key)
    ) {
      try {
        await this.streaksService.checkAndUpdate(
          activityUser,
          activityOrganization,
          (activity as ActivityDocument & { createdAt?: Date }).createdAt ??
            new Date(),
        );
      } catch (error) {
        this.logger.warn('Failed to update streak after activity create', {
          activityId: String(activity._id),
          error,
        });
      }
    }

    return activity;
  }

  async bulkPatch(
    filter: Record<string, unknown>,
    updateDto: Partial<UpdateActivityDto>,
  ): Promise<{ modifiedCount: number; matchedCount: number }> {
    try {
      if (!updateDto || typeof updateDto !== 'object') {
        throw new Error('Update data is required');
      }

      const { filter: _filterField, ...updateData } = updateDto;

      this.logger.debug('Bulk patching activities', { filter, updateData });

      const result = await this.model
        .updateMany(filter, { $set: updateData })
        .exec();

      this.logger.debug('Bulk patch completed', {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      });

      return {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      };
    } catch (error: unknown) {
      this.logger.error('Failed to bulk patch activities', {
        error,
        filter,
        updateDto,
      });

      throw error;
    }
  }

  /**
   * Build entity lookup pipeline stages for activities
   * Optimized: Filters by entityModel early in each lookup pipeline
   * Populates entity field based on entityModel (Ingredient, Post, or Article)
   *
   * Performance notes:
   * - All three lookups run, but each filters by entityModel early
   * - Uses $expr with let variables to pass entityId and entityModel
   * - Requires indexes on entityId + entityModel in activities collection
   * - Requires indexes on _id + isDeleted in ingredients/posts/articles collections
   */
  static buildEntityLookup(): PipelineStage[] {
    return [
      // Lookup ingredients - only matches when entityModel is Ingredient
      {
        $lookup: {
          as: 'ingredient',
          from: 'ingredients',
          let: { entityId: '$entityId', entityModel: '$entityModel' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$entityId'] },
                    { $eq: ['$isDeleted', false] },
                    { $eq: ['$$entityModel', ActivityEntityModel.INGREDIENT] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                category: 1,
                ingredientUrl: 1,
                status: 1,
                thumbnailUrl: 1,
              },
            },
          ],
        },
      },

      // Lookup posts - only matches when entityModel is Post
      {
        $lookup: {
          as: 'post',
          from: 'posts',
          let: { entityId: '$entityId', entityModel: '$entityModel' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$entityId'] },
                    { $eq: ['$isDeleted', false] },
                    { $eq: ['$$entityModel', ActivityEntityModel.POST] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                platform: 1,
                status: 1,
                url: 1,
              },
            },
          ],
        },
      },

      // Lookup articles - only matches when entityModel is Article
      {
        $lookup: {
          as: 'article',
          from: 'articles',
          let: { entityId: '$entityId', entityModel: '$entityModel' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$_id', '$$entityId'] },
                    { $eq: ['$isDeleted', false] },
                    { $eq: ['$$entityModel', ActivityEntityModel.ARTICLE] },
                  ],
                },
              },
            },
            {
              $project: {
                _id: 1,
                status: 1,
                title: 1,
              },
            },
          ],
        },
      },

      // Combine all entity types into a single 'entity' field for easier access
      // This avoids needing to check ingredient/post/article separately in frontend
      {
        $addFields: {
          entity: {
            $cond: {
              else: {
                $cond: {
                  else: {
                    $cond: {
                      else: null,
                      if: { $gt: [{ $size: '$article' }, 0] },
                      then: { $arrayElemAt: ['$article', 0] },
                    },
                  },
                  if: { $gt: [{ $size: '$post' }, 0] },
                  then: { $arrayElemAt: ['$post', 0] },
                },
              },
              if: { $gt: [{ $size: '$ingredient' }, 0] },
              then: { $arrayElemAt: ['$ingredient', 0] },
            },
          },
        },
      },
    ];
  }
}
