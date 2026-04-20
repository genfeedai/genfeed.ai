import { CreateActivityDto } from '@api/collections/activities/dto/create-activity.dto';
import { UpdateActivityDto } from '@api/collections/activities/dto/update-activity.dto';
import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { StreaksService as StreaksServiceToken } from '@api/collections/streaks/services/streaks.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import { ActivityEntityModel } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Inject, Injectable } from '@nestjs/common';

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
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
    @Inject(forwardRef(() => StreaksServiceToken))
    private readonly streaksService: StreaksServiceContract,
  ) {
    super(prisma, 'activity', logger);
  }

  override async create(
    createDto: CreateActivityDto,
  ): Promise<ActivityDocument> {
    const activity = await super.create(createDto);

    const activityUser = activity.userId ? String(activity.userId) : null;
    const activityOrganization = activity.organizationId
      ? String(activity.organizationId)
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
          activityId: String(activity.id),
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

      const result = await this.delegate.updateMany({
        where: filter,
        data: updateData,
      });

      this.logger.debug('Bulk patch completed', {
        count: result.count,
      });

      return {
        matchedCount: result.count,
        modifiedCount: result.count,
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
   * Build entity lookup pipeline stages for activities.
   * NOTE: These are MongoDB aggregation pipeline stages kept for reference.
   * With Prisma, use explicit include/join queries instead of these pipeline stages.
   * TODO: Migrate callers to use Prisma include queries.
   */
  static buildEntityLookup(): Record<string, unknown>[] {
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
