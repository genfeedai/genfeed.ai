import { CreateActivityDto } from '@api/collections/activities/dto/create-activity.dto';
import { UpdateActivityDto } from '@api/collections/activities/dto/update-activity.dto';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
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

type ActivityMutationInput = Partial<CreateActivityDto> &
  Partial<UpdateActivityDto> & {
    action?: string | null;
    brandId?: string | null;
    data?: Record<string, unknown>;
    organizationId?: string | null;
    userId?: string | null;
  };

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

  private isRecordObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private buildActivityMutation(
    input: ActivityMutationInput,
    existing?: ActivityDocument | null,
  ): Record<string, unknown> {
    const currentData = this.isRecordObject(existing?.data)
      ? { ...existing.data }
      : {};
    const nextData = {
      ...currentData,
      ...(this.isRecordObject(input.data) ? input.data : {}),
    };

    if (input.key !== undefined) {
      nextData.key = input.key;
    }

    if (input.source !== undefined) {
      nextData.source = input.source;
    }

    if (input.value !== undefined) {
      nextData.value = input.value;
    }

    if (input.isRead !== undefined) {
      nextData.isRead = input.isRead;
    }

    const mutation: Record<string, unknown> = {
      action: input.action ?? input.key ?? existing?.action ?? null,
      brandId: input.brandId ?? input.brand ?? existing?.brandId ?? null,
      entityId: input.entityId ?? existing?.entityId ?? null,
      entityModel: input.entityModel ?? existing?.entityModel ?? null,
      organizationId:
        input.organizationId ??
        input.organization ??
        existing?.organizationId ??
        null,
      userId: input.userId ?? input.user ?? existing?.userId ?? null,
    };

    if (Object.keys(nextData).length > 0) {
      mutation.data = nextData;
    }

    if (input.isDeleted !== undefined) {
      mutation.isDeleted = input.isDeleted;
    }

    return mutation;
  }

  override async create(
    createDto: CreateActivityDto | ActivityEntity | ActivityMutationInput,
  ): Promise<ActivityDocument> {
    const activity = await super.create(
      this.buildActivityMutation(createDto as ActivityMutationInput) as never,
    );

    const activityUser = activity.userId ? String(activity.userId) : null;
    const activityOrganization = activity.organizationId
      ? String(activity.organizationId)
      : null;
    const activityKey = String(activity.key ?? activity.action ?? '');

    if (
      activityUser &&
      activityOrganization &&
      activityKey &&
      this.streaksService.isQualifyingActivityKey(activityKey)
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

  override async patch(
    id: string,
    updateDto: Partial<UpdateActivityDto> | Record<string, unknown>,
  ): Promise<ActivityDocument> {
    const existing = await super.findOne({ id });
    const mutation = this.buildActivityMutation(
      updateDto as ActivityMutationInput,
      existing,
    );

    return super.patch(id, mutation);
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
        data:
          updateData.isRead === undefined
            ? updateData
            : {
                data: {
                  isRead: updateData.isRead,
                },
                isDeleted: updateData.isDeleted,
              },
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
   * Build the default Prisma query fragment for activity entity relations.
   */
  static buildEntityLookup(): Record<string, unknown> {
    return { where: {} };
  }
}
