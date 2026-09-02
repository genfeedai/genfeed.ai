import { randomUUID } from 'node:crypto';
import {
  SERVER_TOKENS,
  type ServerLogger,
  type ServerPrisma,
} from '@api/server.dependencies';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { PostVisibility, TargetExecutionState } from '@genfeedai/enums';
import type { IChannelTargetError } from '@genfeedai/interfaces';
import { type Post, Prisma } from '@genfeedai/prisma';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';

const MAX_SERIALIZABLE_ATTEMPTS = 3;
// Post has no statusTransitions column. The lifecycle child explicitly forbids
// a schema/visibility change, so target history uses the existing tenant-scoped
// Activity audit store in the same transaction as the Post mutation.
const POST_LIFECYCLE_AUDIT_ACTION = 'post.lifecycle.transition';

export const POST_LIFECYCLE_TRANSITIONS: Readonly<
  Record<TargetExecutionState, ReadonlySet<TargetExecutionState>>
> = {
  [TargetExecutionState.CANCELLED]: new Set(),
  [TargetExecutionState.DRAFT]: new Set([
    TargetExecutionState.CANCELLED,
    TargetExecutionState.FAILED,
    // Compatibility for legacy standalone Posts whose canonical scheduler
    // state was never backfilled from the draft column default.
    TargetExecutionState.PUBLISHING,
    TargetExecutionState.SCHEDULED,
  ]),
  [TargetExecutionState.FAILED]: new Set([
    TargetExecutionState.CANCELLED,
    TargetExecutionState.DRAFT,
    TargetExecutionState.SCHEDULED,
  ]),
  [TargetExecutionState.PAUSED]: new Set([
    TargetExecutionState.CANCELLED,
    TargetExecutionState.DRAFT,
    TargetExecutionState.SCHEDULED,
  ]),
  [TargetExecutionState.PUBLISHED]: new Set(),
  [TargetExecutionState.PUBLISHING]: new Set([
    TargetExecutionState.CANCELLED,
    TargetExecutionState.FAILED,
    TargetExecutionState.PUBLISHED,
    TargetExecutionState.SCHEDULED,
  ]),
  [TargetExecutionState.SCHEDULED]: new Set([
    TargetExecutionState.CANCELLED,
    TargetExecutionState.DRAFT,
    TargetExecutionState.FAILED,
    TargetExecutionState.PAUSED,
    TargetExecutionState.PUBLISHING,
  ]),
  [TargetExecutionState.SKIPPED]: new Set(),
};

export function canTransitionPostLifecycle(
  from: TargetExecutionState,
  to: TargetExecutionState,
): boolean {
  return from === to || POST_LIFECYCLE_TRANSITIONS[from].has(to);
}

// Unchecked so callers can assign FK scalars (e.g. `reviewVersionPinId`)
// directly instead of nested relation writes.
export type PostLifecycleMutation = Omit<
  Prisma.PostUncheckedUpdateManyInput,
  'organizationId' | 'status' | 'targetExecutionState' | 'visibility'
>;

export interface PostLifecycleTransitionGuard {
  expectedUpdatedAt?: Date;
  expectedWorkflowExecutionId?: string;
  priorExecutionStates?: readonly TargetExecutionState[];
}

export interface PostLifecycleTransitionInput {
  actorId?: string | null;
  error?: IChannelTargetError | null;
  groupId?: string;
  guard?: PostLifecycleTransitionGuard;
  mutation?: PostLifecycleMutation;
  nextState: TargetExecutionState;
  organizationId: string;
  postId: string;
  reason?: string;
  visibility?: PostVisibility;
}

export type PostLifecycleTransitionResult =
  | { kind: 'idempotent'; target: Post }
  | { kind: 'stale' }
  | { kind: 'transitioned'; target: Post };

export type PostLifecycleTransaction = Pick<
  Prisma.TransactionClient,
  'activity' | 'post'
>;

class PostLifecycleTargetNotFoundException extends HttpException {
  constructor(postId: string) {
    const detail = `Post with identifier '${postId}' not found`;
    super(
      {
        detail,
        source: { parameter: postId },
        title: 'Resource Not Found',
      },
      HttpStatus.NOT_FOUND,
    );
    this.message = detail;
  }
}

@Injectable()
export class PostLifecycleService {
  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: Pick<
      ServerPrisma,
      '$transaction' | 'activity' | 'post'
    >,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
  ) {}

  async transition(
    input: PostLifecycleTransitionInput,
    transaction?: PostLifecycleTransaction,
  ): Promise<PostLifecycleTransitionResult> {
    if (transaction) {
      return this.persistTransition(transaction, input);
    }

    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt++) {
      try {
        return await this.prisma.$transaction(
          (tx) => this.persistTransition(tx, input),
          { isolationLevel: 'Serializable' },
        );
      } catch (error: unknown) {
        if (
          !this.isSerializationFailure(error) ||
          attempt === MAX_SERIALIZABLE_ATTEMPTS
        ) {
          throw error;
        }
        this.logger.warn('Retrying concurrent Post lifecycle transition', {
          attempt,
          organizationId: input.organizationId,
          postId: input.postId,
          requestedState: input.nextState,
        });
      }
    }

    throw new ConflictException('Post lifecycle transition did not converge.');
  }

  private async persistTransition(
    transaction: PostLifecycleTransaction,
    input: PostLifecycleTransitionInput,
  ): Promise<PostLifecycleTransitionResult> {
    const target = await transaction.post.findFirst({
      where: scopedWhere(input.organizationId, {
        ...(input.groupId ? { groupId: input.groupId } : {}),
        id: input.postId,
      }),
    });
    if (!target) {
      const tombstone =
        input.nextState === TargetExecutionState.CANCELLED
          ? await transaction.post.findFirst({
              where: {
                ...(input.groupId ? { groupId: input.groupId } : {}),
                id: input.postId,
                isDeleted: true,
                organizationId: input.organizationId,
                targetExecutionState: TargetExecutionState.CANCELLED,
              },
            })
          : null;
      if (tombstone) {
        return { kind: 'idempotent', target: tombstone };
      }
      this.logger.warn('Denied unavailable Post lifecycle transition', {
        organizationId: input.organizationId,
        postId: input.postId,
        requestedState: input.nextState,
      });
      throw new PostLifecycleTargetNotFoundException(input.postId);
    }

    const currentState = this.parseState(target.targetExecutionState);
    if (
      input.guard?.expectedUpdatedAt &&
      target.updatedAt.getTime() !== input.guard.expectedUpdatedAt.getTime()
    ) {
      return this.stale(input, currentState, 'updated_at_mismatch');
    }
    if (
      input.guard?.expectedWorkflowExecutionId &&
      target.workflowExecutionId !== input.guard.expectedWorkflowExecutionId
    ) {
      return this.stale(input, currentState, 'workflow_execution_mismatch');
    }

    if (currentState === input.nextState) {
      const updated = await this.updateIdempotentTarget(
        transaction,
        target,
        input,
      );
      return updated
        ? { kind: 'idempotent', target: updated }
        : { kind: 'stale' };
    }

    if (
      input.guard?.priorExecutionStates?.length &&
      !input.guard.priorExecutionStates.includes(currentState)
    ) {
      return this.stale(input, currentState, 'prior_state_mismatch');
    }

    if (!canTransitionPostLifecycle(currentState, input.nextState)) {
      this.logger.warn('Rejected invalid Post lifecycle transition', {
        currentState,
        organizationId: input.organizationId,
        postId: input.postId,
        requestedState: input.nextState,
      });
      throw new ConflictException(
        `Post lifecycle cannot transition from ${currentState} to ${input.nextState}.`,
      );
    }

    const at = new Date();
    const updated = await transaction.post.updateMany({
      data: {
        ...input.mutation,
        ...(input.error !== undefined && {
          targetError: input.error ? this.toJson(input.error) : Prisma.JsonNull,
        }),
        targetExecutionState: input.nextState,
        ...(input.visibility !== undefined && {
          visibility: input.visibility,
        }),
      },
      where: scopedWhere(input.organizationId, {
        ...(input.groupId ? { groupId: input.groupId } : {}),
        id: input.postId,
        targetExecutionState: currentState,
        updatedAt: target.updatedAt,
        ...(input.guard?.expectedWorkflowExecutionId
          ? {
              workflowExecutionId: input.guard.expectedWorkflowExecutionId,
            }
          : {}),
      }),
    });
    if (updated.count !== 1) {
      return this.stale(input, currentState, 'concurrent_mutation');
    }

    await transaction.activity.create({
      data: {
        action: POST_LIFECYCLE_AUDIT_ACTION,
        brandId: target.brandId,
        data: this.toJson({
          actorId: input.actorId ?? null,
          at: at.toISOString(),
          ...(input.error !== undefined ? { error: input.error } : {}),
          from: currentState,
          ...(input.reason ? { reason: input.reason } : {}),
          to: input.nextState,
        }),
        entityId: target.id,
        entityModel: 'post',
        id: randomUUID(),
        organizationId: input.organizationId,
        userId: input.actorId ?? null,
      },
    });

    const persisted = await transaction.post.findFirst({
      where: scopedWhere(input.organizationId, { id: input.postId }),
    });
    if (!persisted) {
      throw new PostLifecycleTargetNotFoundException(input.postId);
    }
    return { kind: 'transitioned', target: persisted };
  }

  private async updateIdempotentTarget(
    transaction: PostLifecycleTransaction,
    target: Post,
    input: PostLifecycleTransitionInput,
  ): Promise<Post | null> {
    const hasMutation =
      input.error !== undefined ||
      input.visibility !== undefined ||
      Boolean(input.mutation && Object.keys(input.mutation).length > 0);
    if (!hasMutation) {
      return target;
    }

    const updated = await transaction.post.updateMany({
      data: {
        ...input.mutation,
        ...(input.error !== undefined && {
          targetError: input.error ? this.toJson(input.error) : Prisma.JsonNull,
        }),
        ...(input.visibility !== undefined && {
          visibility: input.visibility,
        }),
      },
      where: scopedWhere(input.organizationId, {
        ...(input.groupId ? { groupId: input.groupId } : {}),
        id: input.postId,
        targetExecutionState: input.nextState,
        updatedAt: target.updatedAt,
        ...(input.guard?.expectedWorkflowExecutionId
          ? {
              workflowExecutionId: input.guard.expectedWorkflowExecutionId,
            }
          : {}),
      }),
    });
    if (updated.count !== 1) {
      return null;
    }

    return transaction.post.findFirst({
      where: scopedWhere(input.organizationId, { id: input.postId }),
    });
  }

  private parseState(value: string): TargetExecutionState {
    const state = Object.values(TargetExecutionState).find(
      (candidate) => candidate === value,
    );
    if (!state) {
      throw new ConflictException(
        `Post lifecycle contains unsupported state '${value}'.`,
      );
    }
    return state;
  }

  private stale(
    input: PostLifecycleTransitionInput,
    currentState: TargetExecutionState,
    reason: string,
  ): PostLifecycleTransitionResult {
    this.logger.warn('Ignored stale Post lifecycle transition', {
      currentState,
      organizationId: input.organizationId,
      postId: input.postId,
      reason,
      requestedState: input.nextState,
    });
    return { kind: 'stale' };
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
