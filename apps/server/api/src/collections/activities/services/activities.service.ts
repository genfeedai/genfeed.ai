import { CreateActivityDto } from '@api/collections/activities/dto/create-activity.dto';
import { UpdateActivityDto } from '@api/collections/activities/dto/update-activity.dto';
import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import {
  type ActivityMutationInput,
  buildActivityMutation,
  normalizeActivityDocument,
} from '@api/collections/activities/utils/activity-document.util';
import { hydrateGenerationActivity } from '@api/collections/activities/utils/generation-activity.util';
import { normalizeActionOrigin, withActionOriginMetadata } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { AggregatePaginateResult } from '@api/types/aggregate-paginate-result';
import { ActivityKey, parseActivityKey } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import type { AggregationOptions } from '@libs/interfaces/query.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/**
 * Reads and read-state edits for activities. Recording an activity (create,
 * or a key transition) goes through `ActivityRecorderService` (#5197), which
 * also raises the alert the policy map assigns to the key.
 */
@Injectable()
export class ActivitiesService extends BaseService<
  ActivityDocument,
  CreateActivityDto,
  UpdateActivityDto,
  Prisma.ActivityWhereInput
> {
  constructor(
    public readonly prisma: PrismaService,
    public readonly logger: LoggerService,
  ) {
    super(prisma, 'activity', logger);
  }

  private isRecordObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  protected override normalizeDocument(document: unknown): ActivityDocument {
    return normalizeActivityDocument(
      super.normalizeDocument(document) as ActivityDocument,
    );
  }

  override async findAll(
    input: unknown,
    options: AggregationOptions,
    enableCache = true,
  ): Promise<AggregatePaginateResult<ActivityDocument>> {
    const result = await super.findAll(input, options, enableCache);
    return {
      ...result,
      docs: await this.hydrateGenerationActivities(result.docs),
    };
  }

  async hydrateGenerationActivities(
    activities: ActivityDocument[],
  ): Promise<ActivityDocument[]> {
    const candidates = activities.filter(
      (activity): activity is ActivityDocument & { entityId: string } => {
        const { subject, operation } = parseActivityKey(activity.key ?? '');
        return (
          Boolean(activity.entityId) &&
          ['image', 'video', 'music', 'voice'].includes(subject) &&
          ['generate', 'upscale', 'reframe'].includes(operation)
        );
      },
    );
    if (!candidates.length) return activities;
    const idsByOrganization = new Map<string | null, Set<string>>();
    for (const activity of candidates) {
      const organizationId = activity.organizationId ?? null;
      const ids = idsByOrganization.get(organizationId) ?? new Set<string>();
      ids.add(activity.entityId);
      idsByOrganization.set(organizationId, ids);
    }
    const ingredients = [];
    // One batch per organization, including the self-hosted null scope.
    for (const [organizationId, ids] of idsByOrganization) {
      ingredients.push(
        ...(await this.prisma.ingredient.findMany({
          include: { metadata: true },
          where: {
            organizationId,
            isDeleted: false,
            id: { in: [...ids] },
          },
        })),
      );
    }
    const byId = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );
    return activities.map((activity) => {
      const ingredient = activity.entityId
        ? byId.get(activity.entityId)
        : undefined;
      return ingredient &&
        ingredient.organizationId === (activity.organizationId ?? null)
        ? hydrateGenerationActivity(activity, ingredient)
        : activity;
    });
  }

  findGenerationActivity(
    keys: string[],
    ingredientId: string,
    userId: string,
    organizationId?: string,
  ): Promise<ActivityDocument | null> {
    const operation = parseActivityKey(keys[0] ?? '');
    const lifecycleKeys = Object.values(ActivityKey).filter((key) => {
      const parsed = parseActivityKey(key);
      return (
        parsed.subject === operation.subject &&
        parsed.operation === operation.operation
      );
    });
    return super.findOne({
      action: { in: [...new Set([...keys, ...lifecycleKeys])] },
      OR: [
        { entityId: ingredientId },
        { entityId: null, data: { path: ['value'], equals: ingredientId } },
        {
          entityId: null,
          data: {
            path: ['value'],
            string_contains: `"ingredientId":"${ingredientId}"`,
          },
        },
      ],
      entityModel: 'Ingredient',
      isDeleted: false,
      organizationId: organizationId ?? null,
      userId,
    });
  }

  findByActionValue(
    action: string,
    value: string,
    userId: string,
  ): Promise<ActivityDocument | null> {
    return super.findOne({
      action,
      data: {
        path: ['value'],
        string_contains: value,
      },
      userId,
    });
  }

  override async patch(
    id: string,
    updateDto: Partial<UpdateActivityDto> | Record<string, unknown>,
  ): Promise<ActivityDocument> {
    const existing = await super.findOne({ id });
    const mutation = buildActivityMutation(
      updateDto as ActivityMutationInput,
      existing,
    );

    return super.patch(id, { ...mutation });
  }

  /**
   * Scoped bulk update for a caller-supplied id list.
   *
   * Replaces the previous per-id `findOne` + `patch` loop (2N sequential
   * round-trips). Permission partitioning now costs a single `findMany`
   * scoped to owner-or-same-organization, and the writes collapse to either
   * one `updateMany` (flag-only change) or one batched `$transaction` (when
   * `isRead` has to be merged into each row's `data` JSON without clobbering
   * the sibling keys `bulkPatch` destroys).
   */
  async bulkUpdateScoped(params: {
    ids: string[];
    isDeleted?: boolean;
    isRead?: boolean;
    organizationId: string;
    userId: string;
  }): Promise<{ failed: string[]; updated: string[] }> {
    const { ids, isDeleted, isRead, organizationId, userId } = params;

    if (!ids || ids.length === 0) {
      return { failed: [], updated: [] };
    }

    const uniqueIds = [...new Set(ids)];

    const permitted = await this.prisma.activity.findMany({
      select: { data: true, id: true },
      where: {
        id: { in: uniqueIds },
        isDeleted: false,
        OR: [{ userId }, { organizationId }],
      },
    });

    const permittedById = new Map(permitted.map((row) => [row.id, row]));

    const updated: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      if (permittedById.has(id)) {
        updated.push(id);
      } else {
        failed.push(id);
      }
    }

    const writeIds = uniqueIds.filter((id) => permittedById.has(id));

    if (writeIds.length > 0) {
      if (isRead === undefined) {
        if (isDeleted !== undefined) {
          // The scope predicate is repeated on the write, not just the read:
          // it closes the window between the two queries and keeps the tenant
          // guard visible at the mutation site.
          await this.prisma.activity.updateMany({
            data: { isDeleted },
            where: {
              id: { in: writeIds },
              isDeleted: false,
              OR: [{ userId }, { organizationId }],
            },
          });
        }
      } else {
        await this.prisma.$transaction(
          writeIds.map((id) => {
            const currentData = this.isRecordObject(permittedById.get(id)?.data)
              ? { ...(permittedById.get(id)?.data as Record<string, unknown>) }
              : {};

            const nextData = withActionOriginMetadata(
              { ...currentData, isRead },
              {
                ...(typeof currentData.actorUserId === 'string'
                  ? { actorUserId: currentData.actorUserId }
                  : {}),
                ...(typeof currentData.apiKeyId === 'string'
                  ? { apiKeyId: currentData.apiKeyId }
                  : {}),
                origin: normalizeActionOrigin(currentData.origin),
              },
            );

            return this.prisma.activity.update({
              data: {
                data: nextData as Prisma.InputJsonValue,
                ...(isDeleted === undefined ? {} : { isDeleted }),
              },
              where: { id },
            });
          }),
        );
      }
    }

    this.logger.debug('Scoped bulk activity update completed', {
      failed: failed.length,
      requested: ids.length,
      updated: updated.length,
    });

    return { failed, updated };
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
