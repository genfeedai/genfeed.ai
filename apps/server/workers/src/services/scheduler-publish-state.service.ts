import { PostLifecycleService } from '@api/index';
import { deriveReleaseStatusProjectionFromTargets } from '@api-types/contracts/scheduler.contract';
import {
  PostVisibility,
  ReleaseStatus,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { IChannelTargetError } from '@genfeedai/interfaces';
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
  url?: string | null;
  visibility?: PostVisibility;
  workflowExecutionId?: string;
};

export type SchedulerPublishTransitionGuard = {
  expectedWorkflowExecutionId?: string;
  priorExecutionStates?: readonly TargetExecutionState[];
};

export type SchedulerPublishPostIdentity = {
  groupId?: unknown;
  id: unknown;
  organizationId: unknown;
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
};

export class SchedulerPublishStateService {
  private readonly logContext = 'SchedulerPublishStateService';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly postLifecycleService: PostLifecycleService,
  ) {}

  async transitionPost(
    post: SchedulerPublishPostIdentity,
    update: SchedulerPublishTargetUpdate,
    reason?: string,
    guard?: SchedulerPublishTransitionGuard,
  ): Promise<boolean> {
    const groupId = this.readIdentifier(post.groupId);
    const organizationId = this.readIdentifier(post.organizationId);
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
            const transition = await this.postLifecycleService.transition(
              {
                error: input.update.error,
                groupId: input.groupId,
                guard: input.guard,
                mutation: {
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
                  ...(input.update.url !== undefined && {
                    url: input.update.url,
                  }),
                  ...(input.update.workflowExecutionId !== undefined && {
                    workflowExecutionId: input.update.workflowExecutionId,
                  }),
                },
                nextState: input.update.executionState,
                organizationId: input.organizationId,
                postId: input.postId,
                reason: input.reason,
                visibility: input.update.visibility,
              },
              tx,
            );
            if (transition.kind === 'stale') {
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

            const projection = deriveReleaseStatusProjectionFromTargets(
              targets.map((target) => target.targetExecutionState),
            );
            for (const diagnostic of projection.diagnostics) {
              this.logger.warn(
                `${this.logContext} release status derivation failed closed`,
                {
                  ...diagnostic,
                  groupId: group.id,
                  postId: input.postId,
                },
              );
            }
            const terminalPublished =
              projection.status === ReleaseStatus.PUBLISHED ||
              projection.status === ReleaseStatus.PARTIALLY_PUBLISHED;
            if (terminalPublished && !group.publishedAt) {
              const updatedGroup = await tx.postGroup.updateMany({
                data: { publishedAt: new Date() },
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

  private isSerializationFailure(error: unknown): boolean {
    return (
      error !== null &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2034'
    );
  }
}
