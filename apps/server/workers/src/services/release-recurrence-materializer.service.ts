import type { PublishApprovalsService } from '@api/index';
import { ReleaseStatus, TargetExecutionState } from '@genfeedai/contracts';
import {
  deriveReleaseStatusProjectionFromTargets,
  previewRecurrenceOccurrences,
  type RecurrenceInput,
  recurrenceInputSchema,
  resolvePostVisibility,
} from '@genfeedai/contracts/api-types/contracts';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';

const MAX_SERIALIZABLE_ATTEMPTS = 3;
const TERMINAL_RELEASE_STATES = new Set<string>([
  ReleaseStatus.FAILED,
  ReleaseStatus.PARTIALLY_PUBLISHED,
  ReleaseStatus.PUBLISHED,
]);

type RecurrenceSourceGroup = Prisma.PostGroupGetPayload<Record<string, never>>;
type RecurrenceSourceTarget = Prisma.PostGetPayload<{
  include: {
    children: {
      include: { ingredients: { select: { id: true } } };
    };
    ingredients: { select: { id: true } };
  };
}>;

export type MaterializeRecurrenceInput = {
  groupId: string;
  organizationId: string;
  workflowExecutionId: string;
};

export type RecurrenceMaterializationResult =
  | { status: 'exhausted' | 'not_applicable' }
  | { occurrenceId: string; status: 'created' | 'reused' };

export class ReleaseRecurrenceMaterializerService {
  private readonly logContext = 'ReleaseRecurrenceMaterializerService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly publishApprovalsService: PublishApprovalsService,
  ) {}

  async shouldMaterialize(
    input: Pick<MaterializeRecurrenceInput, 'groupId' | 'organizationId'>,
  ): Promise<boolean> {
    const [group, targets] = await Promise.all([
      this.prisma.postGroup.findFirst({
        select: { recurrence: true },
        where: {
          id: input.groupId,
          isDeleted: false,
          organizationId: input.organizationId,
        },
      }),
      this.prisma.post.findMany({
        select: { targetExecutionState: true },
        where: {
          groupId: input.groupId,
          isDeleted: false,
          organizationId: input.organizationId,
          parentId: null,
        },
      }),
    ]);
    if (!group?.recurrence) {
      return false;
    }

    const recurrence = this.asRecord(group.recurrence);
    const status = this.deriveReleaseStatus(
      input.groupId,
      targets.map((target) => target.targetExecutionState),
    );
    return (
      recurrence.isExhausted !== true &&
      recurrence.isPaused !== true &&
      TERMINAL_RELEASE_STATES.has(status)
    );
  }

  async materializeNext(
    input: MaterializeRecurrenceInput,
  ): Promise<RecurrenceMaterializationResult> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.materializeInTransaction(tx, input),
          { isolationLevel: 'Serializable' },
        );
      } catch (error: unknown) {
        if (
          !this.isRetryableConcurrencyFailure(error) ||
          attempt === MAX_SERIALIZABLE_ATTEMPTS
        ) {
          throw error;
        }
        this.logger.warn(`${this.logContext} retrying concurrent expansion`, {
          attempt,
          groupId: input.groupId,
          organizationId: input.organizationId,
        });
      }
    }

    return { status: 'not_applicable' };
  }

  private async materializeInTransaction(
    tx: Prisma.TransactionClient,
    input: MaterializeRecurrenceInput,
  ): Promise<RecurrenceMaterializationResult> {
    const group = await tx.postGroup.findFirst({
      where: {
        id: input.groupId,
        isDeleted: false,
        organizationId: input.organizationId,
      },
    });
    if (!group?.recurrence) {
      return { status: 'not_applicable' };
    }

    const targets = await this.loadTargets(tx, group.id, input.organizationId);
    const status = this.deriveReleaseStatus(
      group.id,
      targets.map((target) => target.targetExecutionState),
    );
    if (!TERMINAL_RELEASE_STATES.has(status)) {
      return { status: 'not_applicable' };
    }

    const recurrenceRecord = this.asRecord(group.recurrence);
    if (recurrenceRecord.isPaused === true) {
      return { status: 'not_applicable' };
    }

    const parsedRecurrence = recurrenceInputSchema.safeParse(recurrenceRecord);
    if (!parsedRecurrence.success) {
      throw new Error(
        `Scheduler release ${group.id} has an invalid recurrence rule.`,
      );
    }

    const startAt = this.resolveSourceSchedule(group.scheduledAt, targets);
    const repeatCount = this.readNonNegativeInteger(
      recurrenceRecord.repeatCount,
    );
    const rootReleaseId =
      this.readString(recurrenceRecord.parentReleaseId) ?? group.id;
    const preview = previewRecurrenceOccurrences({
      limit: 1,
      recurrence: parsedRecurrence.data,
      repeatCount,
      startAt: startAt.toISOString(),
      timezone: group.timezone,
    });
    if (!preview.success) {
      throw new Error(
        `Scheduler release ${group.id} recurrence expansion failed: ${preview.issues
          .map((issue) => issue.message)
          .join('; ')}`,
      );
    }

    const occurrenceAtValue = preview.occurrences[0];
    if (!occurrenceAtValue) {
      await tx.postGroup.updateMany({
        data: {
          recurrence: this.toJson({
            ...recurrenceRecord,
            isExhausted: true,
            nextRunAt: null,
            parentReleaseId: group.id === rootReleaseId ? null : rootReleaseId,
            repeatCount,
          }),
        },
        where: {
          id: group.id,
          isDeleted: false,
          organizationId: input.organizationId,
        },
      });
      return { status: 'exhausted' };
    }

    const nextRepeatCount = repeatCount + 1;
    const occurrenceAt = new Date(occurrenceAtValue);
    const occurrenceKey = this.occurrenceKey(rootReleaseId, nextRepeatCount);
    const existing = await tx.postGroup.findFirst({
      select: { id: true },
      where: {
        idempotencyKey: occurrenceKey,
        organizationId: input.organizationId,
      },
    });
    if (existing) {
      return { occurrenceId: existing.id, status: 'reused' };
    }

    const followingPreview = previewRecurrenceOccurrences({
      limit: 1,
      recurrence: parsedRecurrence.data,
      repeatCount: nextRepeatCount,
      startAt: occurrenceAt.toISOString(),
      timezone: group.timezone,
    });
    if (!followingPreview.success) {
      throw new Error(
        `Scheduler release ${group.id} next recurrence state failed: ${followingPreview.issues
          .map((issue) => issue.message)
          .join('; ')}`,
      );
    }

    const occurrence = await this.createOccurrence(tx, {
      followingOccurrence: followingPreview.occurrences[0] ?? null,
      group,
      input,
      isExhausted:
        followingPreview.isExhausted &&
        followingPreview.occurrences.length === 0,
      nextRepeatCount,
      occurrenceAt,
      occurrenceKey,
      recurrence: parsedRecurrence.data,
      rootReleaseId,
      sourceSchedule: startAt,
      targets,
    });

    await tx.postGroup.updateMany({
      data: {
        recurrence: this.toJson({
          ...recurrenceRecord,
          isExhausted: false,
          nextRunAt: occurrenceAt.toISOString(),
          parentReleaseId: group.id === rootReleaseId ? null : rootReleaseId,
          repeatCount,
        }),
      },
      where: {
        id: group.id,
        isDeleted: false,
        organizationId: input.organizationId,
      },
    });

    return { occurrenceId: occurrence.id, status: 'created' };
  }

  private async loadTargets(
    tx: Prisma.TransactionClient,
    groupId: string,
    organizationId: string,
  ): Promise<RecurrenceSourceTarget[]> {
    return tx.post.findMany({
      include: {
        children: {
          include: {
            ingredients: { select: { id: true } },
          },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
          where: {
            isDeleted: false,
            organizationId,
          },
        },
        ingredients: { select: { id: true } },
      },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      where: {
        groupId,
        isDeleted: false,
        organizationId,
        parentId: null,
      },
    });
  }

  private async createOccurrence(
    tx: Prisma.TransactionClient,
    context: {
      followingOccurrence: string | null;
      group: RecurrenceSourceGroup;
      input: MaterializeRecurrenceInput;
      isExhausted: boolean;
      nextRepeatCount: number;
      occurrenceAt: Date;
      occurrenceKey: string;
      recurrence: RecurrenceInput;
      rootReleaseId: string;
      sourceSchedule: Date;
      targets: RecurrenceSourceTarget[];
    },
  ): Promise<{ id: string }> {
    const occurrence = await tx.postGroup.create({
      data: {
        attachments: this.copyJson(context.group.attachments),
        baseContent: context.group.baseContent,
        brandId: context.group.brandId,
        campaignId: context.group.campaignId,
        idempotencyKey: context.occurrenceKey,
        media: this.copyJson(context.group.media),
        organizationId: context.group.organizationId,
        ownerId: context.group.ownerId,
        recurrence: this.toJson({
          ...context.recurrence,
          isExhausted: context.isExhausted,
          nextRunAt: context.followingOccurrence,
          parentReleaseId: context.rootReleaseId,
          repeatCount: context.nextRepeatCount,
        }),
        scheduledAt: context.occurrenceAt,
        status: ReleaseStatus.SCHEDULED,
        statusTransitions: this.toJson([
          {
            actorId: context.group.ownerId,
            at: new Date().toISOString(),
            from: null,
            reason: `Materialized evergreen occurrence ${context.nextRepeatCount} from ${context.rootReleaseId}.`,
            to: ReleaseStatus.SCHEDULED,
          },
        ]),
        timezone: context.group.timezone,
        title: context.group.title,
      },
    });

    for (const sourceTarget of context.targets) {
      await this.cloneTarget(tx, sourceTarget, occurrence.id, context);
    }
    return occurrence;
  }

  private async cloneTarget(
    tx: Prisma.TransactionClient,
    sourceTarget: RecurrenceSourceTarget,
    occurrenceId: string,
    context: {
      group: RecurrenceSourceGroup;
      input: MaterializeRecurrenceInput;
      nextRepeatCount: number;
      occurrenceAt: Date;
      rootReleaseId: string;
      sourceSchedule: Date;
    },
  ): Promise<void> {
    const scheduledDate = this.offsetSchedule(
      sourceTarget.scheduledDate,
      context.sourceSchedule,
      context.occurrenceAt,
    );
    const target = await tx.post.create({
      data: {
        agentContextSource: sourceTarget.agentContextSource,
        agentContextVersion: sourceTarget.agentContextVersion,
        agentStrategyId: sourceTarget.agentStrategyId,
        agentThreadId: sourceTarget.agentThreadId,
        brandId: sourceTarget.brandId,
        campaignId: sourceTarget.campaignId,
        category: sourceTarget.category,
        credentialId: sourceTarget.credentialId,
        description: sourceTarget.description,
        groupId: occurrenceId,
        ...(sourceTarget.ingredients.length > 0
          ? {
              ingredients: {
                connect: sourceTarget.ingredients.map(({ id }) => ({ id })),
              },
            }
          : {}),
        label: sourceTarget.label,
        order: sourceTarget.order,
        organizationId: context.input.organizationId,
        originalPostId: sourceTarget.originalPostId ?? sourceTarget.id,
        platform: sourceTarget.platform,
        scheduledDate,
        source: sourceTarget.source,
        sourceActionId: sourceTarget.sourceActionId,
        sourceWorkflowId: sourceTarget.sourceWorkflowId,
        sourceWorkflowName: sourceTarget.sourceWorkflowName,
        targetAttachments: this.copyJson(sourceTarget.targetAttachments),
        targetExecutionState: TargetExecutionState.SCHEDULED,
        targetIdempotencyKey: this.targetKey(
          context.rootReleaseId,
          context.nextRepeatCount,
          sourceTarget.originalPostId ?? sourceTarget.id,
        ),
        targetReadiness: sourceTarget.targetReadiness ?? Prisma.JsonNull,
        targetSettings: this.copyJson(sourceTarget.targetSettings),
        targetValidationIssues: sourceTarget.targetValidationIssues,
        targetValidationState: sourceTarget.targetValidationState,
        timezone: sourceTarget.timezone,
        userId: sourceTarget.userId,
        visibility: resolvePostVisibility(sourceTarget.visibility),
        workflowExecutionId: context.input.workflowExecutionId,
      },
    });

    for (const sourceChild of sourceTarget.children) {
      await this.cloneChild(tx, sourceChild, target.id, occurrenceId, context);
    }
    await this.publishApprovalsService.createForCurrentPost({
      actorUserId: context.group.ownerId,
      mode: 'scheduled',
      organizationId: context.group.organizationId,
      postId: target.id,
      provenance: {
        occurrenceIndex: context.nextRepeatCount,
        releaseId: occurrenceId,
        sourceReleaseId: context.rootReleaseId,
        surface: 'evergreen-recurrence',
        workflowExecutionId: context.input.workflowExecutionId,
      },
      transaction: tx,
    });
  }

  private async cloneChild(
    tx: Prisma.TransactionClient,
    sourceChild: RecurrenceSourceTarget['children'][number],
    parentId: string,
    occurrenceId: string,
    context: {
      input: MaterializeRecurrenceInput;
      occurrenceAt: Date;
      sourceSchedule: Date;
    },
  ): Promise<void> {
    const scheduledDate = this.offsetSchedule(
      sourceChild.scheduledDate,
      context.sourceSchedule,
      context.occurrenceAt,
    );
    await tx.post.create({
      data: {
        agentContextSource: sourceChild.agentContextSource,
        agentContextVersion: sourceChild.agentContextVersion,
        agentStrategyId: sourceChild.agentStrategyId,
        agentThreadId: sourceChild.agentThreadId,
        brandId: sourceChild.brandId,
        campaignId: sourceChild.campaignId,
        category: sourceChild.category,
        credentialId: sourceChild.credentialId,
        description: sourceChild.description,
        groupId: occurrenceId,
        ...(sourceChild.ingredients.length > 0
          ? {
              ingredients: {
                connect: sourceChild.ingredients.map(({ id }) => ({ id })),
              },
            }
          : {}),
        label: sourceChild.label,
        order: sourceChild.order,
        organizationId: context.input.organizationId,
        originalPostId: sourceChild.originalPostId ?? sourceChild.id,
        parentId,
        platform: sourceChild.platform,
        scheduledDate,
        source: sourceChild.source,
        sourceActionId: sourceChild.sourceActionId,
        sourceWorkflowId: sourceChild.sourceWorkflowId,
        sourceWorkflowName: sourceChild.sourceWorkflowName,
        targetExecutionState: TargetExecutionState.SCHEDULED,
        timezone: sourceChild.timezone,
        userId: sourceChild.userId,
        visibility: resolvePostVisibility(sourceChild.visibility),
        workflowExecutionId: context.input.workflowExecutionId,
      },
    });
  }

  private resolveSourceSchedule(
    groupSchedule: Date | null,
    targets: readonly { scheduledDate: Date | null }[],
  ): Date {
    if (groupSchedule) {
      return groupSchedule;
    }
    const targetTimestamps = targets
      .map((target) => target.scheduledDate?.getTime())
      .filter((value): value is number => value !== undefined);
    if (targetTimestamps.length === 0) {
      throw new Error('A recurring scheduler release requires a schedule.');
    }
    return new Date(Math.min(...targetTimestamps));
  }

  private offsetSchedule(
    targetSchedule: Date | null,
    sourceSchedule: Date,
    occurrenceAt: Date,
  ): Date {
    const offset =
      (targetSchedule ?? sourceSchedule).getTime() - sourceSchedule.getTime();
    return new Date(occurrenceAt.getTime() + offset);
  }

  private occurrenceKey(rootReleaseId: string, index: number): string {
    return `system:evergreen-release:${rootReleaseId}:${index}`;
  }

  private targetKey(
    rootReleaseId: string,
    index: number,
    sourceTargetId: string,
  ): string {
    return `system:evergreen-target:${rootReleaseId}:${index}:${sourceTargetId}`;
  }

  private asRecord(value: Prisma.JsonValue): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private readNonNegativeInteger(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? value
      : 0;
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private deriveReleaseStatus(
    groupId: string,
    targetStates: readonly unknown[],
  ): ReleaseStatus {
    const projection = deriveReleaseStatusProjectionFromTargets(targetStates);
    for (const diagnostic of projection.diagnostics) {
      this.logger.warn(
        `${this.logContext} release status derivation failed closed`,
        { ...diagnostic, groupId },
      );
    }
    return projection.status;
  }

  private isRetryableConcurrencyFailure(error: unknown): boolean {
    if (!error || typeof error !== 'object' || !('code' in error)) {
      return false;
    }
    const code = (error as { code?: unknown }).code;
    return code === 'P2002' || code === 'P2034';
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }

  private copyJson(value: Prisma.JsonValue) {
    return value === null ? Prisma.JsonNull : this.toJson(value);
  }
}
