import { CreateActivityDto } from '@api/collections/activities/dto/create-activity.dto';
import { UpdateActivityDto } from '@api/collections/activities/dto/update-activity.dto';
import { ActivityEntity } from '@api/collections/activities/entities/activity.entity';
import type { ActivityDocument } from '@api/collections/activities/schemas/activity.schema';
import { StreaksService as StreaksServiceToken } from '@api/collections/streaks/services/streaks.service';
import {
  getActionOriginContext,
  normalizeActionOrigin,
  withActionOriginMetadata,
} from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BaseService } from '@api/shared/services/base/base.service';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

type StreaksServiceContract = Pick<
  StreaksServiceToken,
  'checkAndUpdate' | 'isQualifyingActivityKey'
>;

type ActivityMutationInput = Partial<CreateActivityDto> &
  Partial<UpdateActivityDto> & {
    action?: string | null;
    data?: Record<string, unknown>;
  };

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
    @Inject(forwardRef(() => StreaksServiceToken))
    private readonly streaksService: StreaksServiceContract,
  ) {
    super(prisma, 'activity', logger);
  }

  @OnEvent('credits.activity')
  async handleCreditsActivity(data: Record<string, unknown>): Promise<void> {
    try {
      await this.create(data);
    } catch (error) {
      this.logger.warn('Failed to create activity from credits event', {
        error,
      });
    }
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
    const nextData: Record<string, unknown> = {
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

    const originContext = existing
      ? {
          ...(typeof currentData.actorUserId === 'string'
            ? { actorUserId: currentData.actorUserId }
            : {}),
          ...(typeof currentData.apiKeyId === 'string'
            ? { apiKeyId: currentData.apiKeyId }
            : {}),
          origin: normalizeActionOrigin(currentData.origin),
        }
      : getActionOriginContext();
    const trustedData = withActionOriginMetadata(nextData, originContext);

    const mutation: Record<string, unknown> = {
      action: input.action ?? input.key ?? existing?.action ?? null,
      brandId: input.brandId ?? existing?.brandId ?? null,
      entityId: input.entityId ?? existing?.entityId ?? null,
      entityModel: input.entityModel ?? existing?.entityModel ?? null,
      organizationId: input.organizationId ?? existing?.organizationId ?? null,
      userId: input.userId ?? existing?.userId ?? null,
    };

    if (Object.keys(trustedData).length > 0) {
      mutation.data = trustedData;
    }

    if (input.isDeleted !== undefined) {
      mutation.isDeleted = input.isDeleted;
    }

    return mutation;
  }

  protected override normalizeDocument(document: unknown): ActivityDocument {
    const normalized = super.normalizeDocument(document) as ActivityDocument;
    if (!normalized || typeof normalized !== 'object') {
      return normalized;
    }

    const data = this.isRecordObject(normalized.data)
      ? { ...normalized.data }
      : {};
    const origin = normalizeActionOrigin(normalized.origin ?? data.origin);
    data.origin = origin;
    normalized.data = data as Prisma.JsonValue;
    normalized.origin = origin;

    // Prisma columns are action + data JSON. Wire contract (serializer /
    // frontend) still expects top-level key/value/source/isRead. Promote from
    // data first, then fall back to the action column so list UIs do not render
    // blank rows with only a timestamp.
    const keyFromData =
      typeof data.key === 'string' && data.key.length > 0 ? data.key : null;
    const actionKey =
      typeof normalized.action === 'string' && normalized.action.length > 0
        ? normalized.action
        : null;
    const existingKey =
      typeof normalized.key === 'string' && normalized.key.length > 0
        ? normalized.key
        : null;
    normalized.key = existingKey ?? keyFromData ?? actionKey ?? null;

    if (
      (typeof normalized.value !== 'string' || normalized.value.length === 0) &&
      typeof data.value === 'string'
    ) {
      normalized.value = data.value;
    }

    if (
      (typeof normalized.source !== 'string' ||
        normalized.source.length === 0) &&
      typeof data.source === 'string'
    ) {
      normalized.source = data.source;
    }

    if (typeof normalized.isRead !== 'boolean') {
      normalized.isRead =
        typeof data.isRead === 'boolean' ? data.isRead : false;
    }

    if (
      (typeof normalized.status !== 'string' ||
        (normalized.status as string).length === 0) &&
      typeof data.status === 'string'
    ) {
      (normalized as ActivityDocument & { status?: string }).status =
        data.status;
    }

    normalized.actorUserId =
      typeof normalized.actorUserId === 'string'
        ? normalized.actorUserId
        : typeof data.actorUserId === 'string'
          ? data.actorUserId
          : null;
    normalized.apiKeyId =
      typeof normalized.apiKeyId === 'string'
        ? normalized.apiKeyId
        : typeof data.apiKeyId === 'string'
          ? data.apiKeyId
          : null;
    return normalized;
  }

  override async create(
    createDto: CreateActivityDto | ActivityEntity | ActivityMutationInput,
  ): Promise<ActivityDocument> {
    const activity = await super.create(
      this.buildActivityMutation(
        createDto as ActivityMutationInput,
      ) as unknown as CreateActivityDto,
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

  /**
   * Batch-create activities in a single insert.
   *
   * `create` costs one insert plus a streak round-trip, so emitting one
   * activity per item of a batched endpoint was 2N sequential queries. The
   * streak check is idempotent per `(user, organization)`, so it collapses to
   * one call per distinct pair rather than one per activity.
   *
   * Returns the number of rows inserted. Callers that need the created rows
   * back should keep using `create` — `createMany` does not return records.
   */
  async createMany(
    inputs: ReadonlyArray<
      CreateActivityDto | ActivityEntity | ActivityMutationInput
    >,
  ): Promise<number> {
    if (inputs.length === 0) {
      return 0;
    }

    const mutations = inputs.map((input) =>
      this.buildActivityMutation(input as ActivityMutationInput),
    );

    const result = await this.prisma.activity.createMany({
      data: mutations as unknown as Prisma.ActivityCreateManyInput[],
    });

    const qualifyingPairs = new Map<
      string,
      { organizationId: string; userId: string }
    >();

    mutations.forEach((mutation, index) => {
      const userId = mutation.userId ? String(mutation.userId) : null;
      const organizationId = mutation.organizationId
        ? String(mutation.organizationId)
        : null;
      const activityKey = String(
        (inputs[index] as ActivityMutationInput).key ?? mutation.action ?? '',
      );

      if (!userId || !organizationId || !activityKey) {
        return;
      }

      if (!this.streaksService.isQualifyingActivityKey(activityKey)) {
        return;
      }

      qualifyingPairs.set(`${organizationId}:${userId}`, {
        organizationId,
        userId,
      });
    });

    const createdAt = new Date();

    for (const { organizationId, userId } of qualifyingPairs.values()) {
      try {
        await this.streaksService.checkAndUpdate(
          userId,
          organizationId,
          createdAt,
        );
      } catch (error) {
        this.logger.warn(
          'Failed to update streak after activity batch create',
          {
            error,
            organizationId,
            userId,
          },
        );
      }
    }

    return result.count;
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
