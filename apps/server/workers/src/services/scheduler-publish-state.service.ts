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
import { Injectable } from '@nestjs/common';

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
};

export type SchedulerPublishPostIdentity = {
  groupId?: unknown;
  id: unknown;
  organization?: unknown;
  organizationId?: unknown;
};

type SchedulerPublishStateInput = {
  groupId: string;
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

@Injectable()
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
  ): Promise<boolean> {
    const groupId = this.readIdentifier(post.groupId);
    const organizationId = this.readIdentifier(
      post.organizationId ?? post.organization,
    );
    const postId = this.readIdentifier(post.id);
    if (!groupId || !organizationId || !postId) {
      return false;
    }

    await this.transition({
      groupId,
      organizationId,
      postId,
      reason,
      update,
    });
    return true;
  }

  async transition(input: SchedulerPublishStateInput): Promise<void> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt++) {
      try {
        await this.prisma.$transaction(
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
              },
              where: {
                groupId: input.groupId,
                id: input.postId,
                isDeleted: false,
                organizationId: input.organizationId,
              },
            });
            if (updated.count !== 1) {
              throw new Error(
                `Scheduler target ${input.postId} is no longer available in release ${input.groupId}.`,
              );
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
          },
          { isolationLevel: 'Serializable' },
        );
        return;
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
