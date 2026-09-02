import type { SchedulerPostGroup } from '@api/collections/post-groups/services/post-group.types';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostGroupsService } from '@api/collections/post-groups/services/post-groups.service';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ReleaseStatus } from '@genfeedai/contracts';
import {
  previewRecurrenceOccurrences,
  type RecurrencePreviewInput,
  type RecurrencePreviewResult,
} from '@genfeedai/contracts/api-types/contracts/recurrence-preview.contract';
import {
  type RecurrenceInput,
  type UpdateRecurrenceSeriesInput,
  updateRecurrenceSeriesSchema,
} from '@genfeedai/contracts/api-types/contracts/scheduler.contract';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

const FUTURE_SERIES_STATES = new Set<string>([
  ReleaseStatus.DRAFT,
  ReleaseStatus.PAUSED,
  ReleaseStatus.SCHEDULED,
]);

type StoredSeriesRow = Pick<
  SchedulerPostGroup,
  'id' | 'recurrence' | 'scheduledAt' | 'timezone'
>;

type SeriesRow = StoredSeriesRow & { status: ReleaseStatus };

@Injectable()
export class PostGroupRecurrenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contractService: PostGroupContractService,
    private readonly postGroupsService: PostGroupsService,
  ) {}

  preview(body: unknown): RecurrencePreviewResult {
    return previewRecurrenceOccurrences(body as RecurrencePreviewInput);
  }

  async pauseFuture(
    organizationId: string,
    userId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    const series = await this.getSeries(organizationId, groupId);
    const future = this.futureRows(series.rows);

    await this.updateRecurrenceState(organizationId, series.rows, {
      isPaused: true,
    });
    for (const row of future) {
      if (row.status === ReleaseStatus.SCHEDULED) {
        await this.postGroupsService.pause(organizationId, userId, row.id);
      }
    }

    return this.postGroupsService.getOne(
      organizationId,
      this.responseGroupId(groupId, future),
    );
  }

  async resumeFuture(
    organizationId: string,
    userId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    const series = await this.getSeries(organizationId, groupId);
    const future = this.futureRows(series.rows);

    await this.updateRecurrenceState(organizationId, series.rows, {
      isPaused: false,
    });
    for (const row of future) {
      if (row.status === ReleaseStatus.PAUSED) {
        await this.postGroupsService.resume(organizationId, userId, row.id);
      }
    }

    return this.postGroupsService.getOne(
      organizationId,
      this.responseGroupId(groupId, future),
    );
  }

  async cancelFuture(
    organizationId: string,
    userId: string,
    groupId: string,
  ): Promise<IReleaseGroup> {
    const series = await this.getSeries(organizationId, groupId);
    const future = this.futureRows(series.rows);

    await this.updateRecurrenceState(organizationId, series.rows, {
      isExhausted: true,
      isPaused: false,
      nextRunAt: null,
    });
    for (const row of future) {
      await this.postGroupsService.cancel(organizationId, userId, row.id);
    }

    return this.postGroupsService.getOne(
      organizationId,
      this.responseGroupId(groupId, future),
    );
  }

  async editFuture(
    organizationId: string,
    userId: string,
    groupId: string,
    body: unknown,
  ): Promise<IReleaseGroup> {
    const input = this.parseSeriesUpdate(body);
    const series = await this.getSeries(organizationId, groupId);
    const next = this.futureRows(series.rows)[0];
    if (!next) {
      throw new ConflictException(
        'This evergreen series has no editable future occurrence.',
      );
    }

    const existingRecurrence = this.contractService.asRecord(next.recurrence);
    const recurrence =
      input.recurrence ?? this.toRecurrenceInput(existingRecurrence);
    const startAt =
      input.scheduledDate ?? next.scheduledAt?.toISOString() ?? undefined;
    const timezone = input.timezone ?? next.timezone;
    if (!startAt) {
      throw new ConflictException(
        'This evergreen series has no future schedule to edit.',
      );
    }

    const preview = previewRecurrenceOccurrences({
      limit: 1,
      recurrence,
      repeatCount: this.nonNegativeInteger(existingRecurrence.repeatCount),
      startAt,
      timezone,
    });
    if (!preview.success) {
      throw new BadRequestException({
        detail: preview.issues.map((issue) => issue.message).join('; '),
        title: 'Invalid evergreen series edit',
      });
    }

    await this.postGroupsService.update(organizationId, userId, next.id, input);
    await this.prisma.postGroup.updateMany({
      data: {
        recurrence: this.contractService.toJson({
          ...existingRecurrence,
          ...recurrence,
          isExhausted: preview.isExhausted && preview.occurrences.length === 0,
          isPaused: false,
          nextRunAt: preview.occurrences[0] ?? null,
        }),
      },
      where: scopedWhere(organizationId, { id: next.id }),
    });

    return this.postGroupsService.getOne(organizationId, next.id);
  }

  private parseSeriesUpdate(body: unknown): UpdateRecurrenceSeriesInput {
    const parsed = updateRecurrenceSeriesSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        detail: parsed.error.issues
          .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
          .join('; '),
        title: 'Invalid evergreen series edit',
      });
    }
    return parsed.data;
  }

  private async getSeries(
    organizationId: string,
    groupId: string,
  ): Promise<{ rootId: string; rows: SeriesRow[] }> {
    const anchor = await this.prisma.postGroup.findFirst({
      select: {
        id: true,
        recurrence: true,
        scheduledAt: true,
        timezone: true,
      },
      where: scopedWhere(organizationId, { id: groupId }),
    });
    if (!anchor) {
      throw new ConflictException('The scheduled release is unavailable.');
    }

    const recurrence = this.contractService.asRecord(anchor.recurrence);
    if (Object.keys(recurrence).length === 0) {
      throw new ConflictException(
        'This scheduled release is not an evergreen series.',
      );
    }
    const rootId =
      typeof recurrence.parentReleaseId === 'string'
        ? recurrence.parentReleaseId
        : anchor.id;
    const rows = await this.prisma.postGroup.findMany({
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        recurrence: true,
        scheduledAt: true,
        timezone: true,
      },
      where: scopedWhere(organizationId, {
        OR: [
          { id: rootId },
          {
            recurrence: {
              equals: rootId,
              path: ['parentReleaseId'],
            },
          },
        ],
      }),
    });

    const statesByGroup = new Map<string, unknown[]>();
    if (rows.length > 0) {
      const targets = await this.prisma.post.findMany({
        select: { groupId: true, targetExecutionState: true },
        where: scopedWhere(organizationId, {
          groupId: { in: rows.map((row) => row.id) },
          parentId: null,
        }),
      });
      for (const target of targets) {
        if (!target.groupId) {
          continue;
        }
        const states = statesByGroup.get(target.groupId) ?? [];
        states.push(target.targetExecutionState);
        statesByGroup.set(target.groupId, states);
      }
    }

    return {
      rootId,
      rows: rows.map((row) => ({
        ...row,
        status: this.contractService.deriveReleaseStatus(
          row.id,
          statesByGroup.get(row.id) ?? [],
        ),
      })),
    };
  }

  private futureRows(rows: readonly SeriesRow[]): SeriesRow[] {
    return rows.filter((row) => FUTURE_SERIES_STATES.has(row.status));
  }

  private responseGroupId(
    requestedGroupId: string,
    future: readonly SeriesRow[],
  ): string {
    return (
      future.find((row) => row.id === requestedGroupId)?.id ??
      future[0]?.id ??
      requestedGroupId
    );
  }

  private async updateRecurrenceState(
    organizationId: string,
    rows: readonly SeriesRow[],
    state: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.postGroup.updateMany({
          data: {
            recurrence: this.contractService.toJson({
              ...this.contractService.asRecord(row.recurrence),
              ...state,
            }),
          },
          where: scopedWhere(organizationId, { id: row.id }),
        }),
      ),
    );
  }

  private toRecurrenceInput(
    recurrence: Record<string, unknown>,
  ): RecurrenceInput {
    const parsed = updateRecurrenceSeriesSchema.safeParse({
      recurrence: {
        endDate: recurrence.endDate,
        frequency: recurrence.frequency,
        interval: recurrence.interval,
        maxRepeats: recurrence.maxRepeats,
        weekdays: recurrence.weekdays,
      },
    });
    if (!parsed.success || !parsed.data.recurrence) {
      throw new ConflictException(
        'The persisted evergreen recurrence rule is invalid.',
      );
    }
    return parsed.data.recurrence;
  }

  private nonNegativeInteger(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? value
      : 0;
  }
}
