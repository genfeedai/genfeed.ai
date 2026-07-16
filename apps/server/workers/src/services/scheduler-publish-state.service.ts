import { deriveReleaseStatusFromTargets } from '@api-types/contracts/scheduler.contract';
import {
  PostStatus,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type {
  IChannelTargetError,
  IScheduleStatusTransition,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';

const MAX_SERIALIZABLE_ATTEMPTS = 3;

export type SchedulerPublishTargetUpdate = {
  error?: IChannelTargetError | null;
  executionState: TargetExecutionState;
  externalId?: string | null;
  externalShortcode?: string | null;
  lastAttemptAt?: Date;
  publicationDate?: Date;
  publishedAt?: Date;
  retryCount?: number;
  status: PostStatus;
  url?: string | null;
  workflowExecutionId?: string;
};

export type SchedulerPublishTransitionGuard = {
  expectedWorkflowExecutionId?: string;
  priorExecutionStates?: readonly TargetExecutionState[];
};

export type SchedulerPublishPostIdentity = {
  groupId?: unknown;
  id: unknown;
  organization?: unknown;
  organizationId?: unknown;
};

type SchedulerPublishStateInput = {
  groupId?: string;
  guard?: SchedulerPublishTransitionGuard;
  organizationId: string;
  postId: string;
  reason?: string;
  update: SchedulerPublishTargetUpdate;
};

type SchedulerGroupRow = {
  id: string;
  publishedAt: Date | null;
  status: string;
  statusTransitions: Prisma.JsonValue;
};

export class SchedulerPublishStateService {
  private readonly logContext = 'SchedulerPublishStateService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  async transitionPost(
    post: SchedulerPublishPostIdentity,
    update: SchedulerPublishTargetUpdate,
    reason?: string,
    guard?: SchedulerPublishTransitionGuard,
  ): Promise<boolean> {
    const groupId = this.readIdentifier(post.groupId);
    const organizationId = this.readIdentifier(
      post.organizationId ?? post.organization,
    );
    const postId = this.readIdentifier(post.id);
    if (!organizationId || !postId) {
      return false;
    }

    return this.transition({
      groupId,
      guard,
      organizationId,
      postId,
      reason,
      update,
    });
  }

  async transition(input: SchedulerPublishStateInput): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt++) {
      try {
        const applied = await this.prisma.$transaction(
          async (tx) => {
            const updated = await tx.post.updateMany({
              data: {
                ...(input.update.error !== undefined && {
                  targetError: input.update.error
                    ? this.toJson(input.update.error)
                    : Prisma.JsonNull,
                }),
                ...(input.update.externalId !== undefined && {
                  externalId: input.update.externalId,
                }),
                ...(input.update.externalShortcode !== undefined && {
                  externalShortcode: input.update.externalShortcode,
                }),
                ...(input.update.lastAttemptAt !== undefined && {
                  lastAttemptAt: input.update.lastAttemptAt,
                }),
                ...(input.update.publicationDate !== undefined && {
                  publicationDate: input.update.publicationDate,
                }),
                ...(input.update.publishedAt !== undefined && {
                  publishedAt: input.update.publishedAt,
                }),
                ...(input.update.retryCount !== undefined && {
                  retryCount: input.update.retryCount,
                }),
                status: input.update.status,
                targetExecutionState: input.update.executionState,
                ...(input.update.url !== undefined && {
                  url: input.update.url,
                }),
                ...(input.update.workflowExecutionId !== undefined && {
                  workflowExecutionId: input.update.workflowExecutionId,
                }),
              },
              where: {
                ...(input.groupId ? { groupId: input.groupId } : {}),
                id: input.postId,
                isDeleted: false,
                organizationId: input.organizationId,
                ...(input.guard?.expectedWorkflowExecutionId
                  ? {
                      workflowExecutionId:
                        input.guard.expectedWorkflowExecutionId,
                    }
                  : {}),
                ...(input.guard?.priorExecutionStates?.length
                  ? {
                      targetExecutionState: {
                        in: [...input.guard.priorExecutionStates],
                      },
                    }
                  : {}),
              },
            });
            if (updated.count !== 1) {
              this.logger.warn(
                `${this.logContext} ignored stale publish transition`,
                {
                  expectedWorkflowExecutionId:
                    input.guard?.expectedWorkflowExecutionId,
                  groupId: input.groupId,
                  postId: input.postId,
                  priorExecutionStates: input.guard?.priorExecutionStates,
                },
              );
              return false;
            }

            if (!input.groupId) {
              return true;
            }

            const [group, targets] = await Promise.all([
              tx.postGroup.findFirst({
                select: {
                  id: true,
                  publishedAt: true,
                  status: true,
                  statusTransitions: true,
                },
                where: {
                  id: input.groupId,
                  isDeleted: false,
                  organizationId: input.organizationId,
                },
              }) as Promise<SchedulerGroupRow | null>,
              tx.post.findMany({
                select: { targetExecutionState: true },
                where: {
                  groupId: input.groupId,
                  isDeleted: false,
                  organizationId: input.organizationId,
                  parentId: null,
                },
              }),
            ]);
            if (!group) {
              throw new Error(
                `Scheduler release ${input.groupId} is no longer available.`,
              );
            }

            const status = deriveReleaseStatusFromTargets(
              targets.map((target) =>
                this.readExecutionState(target.targetExecutionState),
              ),
            );
            const statusChanged = status !== group.status;
            const now = new Date();
            const terminalPublished =
              status === ReleaseStatus.PUBLISHED ||
              status === ReleaseStatus.PARTIALLY_PUBLISHED;
            const updatedGroup = await tx.postGroup.updateMany({
              data: {
                ...(terminalPublished && !group.publishedAt
                  ? { publishedAt: now }
                  : {}),
                status,
                ...(statusChanged && {
                  statusTransitions: this.toJson([
                    ...this.readTransitions(group.statusTransitions),
                    {
                      actorId: null,
                      at: now.toISOString(),
                      from: group.status,
                      ...(input.reason ? { reason: input.reason } : {}),
                      to: status,
                    },
                  ]),
                }),
              },
              where: {
                id: input.groupId,
                isDeleted: false,
                organizationId: input.organizationId,
              },
            });
            if (updatedGroup.count !== 1) {
              throw new Error(
                `Scheduler release ${input.groupId} is no longer available.`,
              );
            }
            return true;
          },
          { isolationLevel: 'Serializable' },
        );
        return applied;
      } catch (error: unknown) {
        if (
          !this.isSerializationFailure(error) ||
          attempt === MAX_SERIALIZABLE_ATTEMPTS
        ) {
          throw error;
        }
        this.logger.warn(`${this.logContext} retrying concurrent roll-up`, {
          attempt,
          groupId: input.groupId,
          postId: input.postId,
        });
      }
    }
    return false;
  }

  private readExecutionState(value: string): TargetExecutionState {
    const state = Object.values(TargetExecutionState).find(
      (candidate) => candidate === value,
    );
    if (!state) {
      throw new Error(`Unknown scheduler target execution state: ${value}`);
    }
    return state;
  }

  private readIdentifier(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value.trim() || undefined;
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }
    if (value && typeof value === 'object') {
      if ('id' in value) {
        const nestedId = this.readIdentifier(value.id);
        if (nestedId) {
          return nestedId;
        }
      }
      if (!('toString' in value) || typeof value.toString !== 'function') {
        return undefined;
      }
      const identifier = value.toString();
      return identifier && identifier !== '[object Object]'
        ? identifier
        : undefined;
    }
    return undefined;
  }

  private readTransitions(
    value: Prisma.JsonValue,
  ): IScheduleStatusTransition[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter(
        (entry) =>
          Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
      )
      .map((entry) => entry as unknown as IScheduleStatusTransition);
  }

  private isSerializationFailure(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2034'
    );
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return value as Prisma.InputJsonValue;
  }
}
