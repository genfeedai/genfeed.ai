import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetAnalyticsCollectionState } from '@genfeedai/enums';
import { Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import { Injectable } from '@nestjs/common';
import type {
  AnalyticsCollectionAttemptRef,
  AnalyticsCollectionFailure,
  AnalyticsCollectionTargetRef,
  ServerAnalyticsCollectionState,
} from '@server/server.dependencies';

export interface MarkAnalyticsCollectionPendingInput {
  attemptKey: string;
  requestedAt: Date;
  targets: AnalyticsCollectionTargetRef[];
}

@Injectable()
export class PostAnalyticsCollectionStateService
  implements ServerAnalyticsCollectionState
{
  constructor(private readonly prisma: PrismaService) {}

  async markPending(input: MarkAnalyticsCollectionPendingInput): Promise<void> {
    const targetsByScope = new Map<string, AnalyticsCollectionTargetRef[]>();
    for (const target of input.targets) {
      const scopeKey = `${target.organizationId}:${target.brandId}:${target.platform}`;
      const scopedTargets = targetsByScope.get(scopeKey) ?? [];
      scopedTargets.push(target);
      targetsByScope.set(scopeKey, scopedTargets);
    }

    for (const targets of targetsByScope.values()) {
      const [scope] = targets;
      if (!scope) {
        continue;
      }
      await this.prisma.post.updateMany({
        data: {
          analyticsCollectionAttemptKey: input.attemptKey,
          analyticsCollectionError: Prisma.DbNull,
          analyticsCollectionRequestedAt: input.requestedAt,
          analyticsCollectionState: TargetAnalyticsCollectionState.PENDING,
        },
        where: scopedWhere(scope.organizationId, {
          brandId: scope.brandId,
          groupId: { not: null },
          id: { in: targets.map((target) => target.id) },
          parentId: null,
          platform: scope.platform,
        }),
      });
    }
  }

  async markReady(
    target: AnalyticsCollectionAttemptRef,
    collectedAt = new Date(),
  ): Promise<void> {
    if (!target.attemptKey) {
      return;
    }

    await this.prisma.post.updateMany({
      data: {
        analyticsCollectedAt: collectedAt,
        analyticsCollectionAttemptKey: null,
        analyticsCollectionError: Prisma.DbNull,
        analyticsCollectionState: TargetAnalyticsCollectionState.READY,
      },
      where: {
        ...this.targetWhere(target),
        analyticsCollectionAttemptKey: target.attemptKey,
      },
    });
  }

  async markFailed(
    target: AnalyticsCollectionAttemptRef,
    failure: AnalyticsCollectionFailure,
  ): Promise<void> {
    if (!target.attemptKey) {
      return;
    }

    await this.prisma.post.updateMany({
      data: {
        analyticsCollectionError: {
          code: failure.code,
          failedAt: new Date().toISOString(),
          isRetryable: failure.isRetryable,
          message: failure.message,
        },
        analyticsCollectionState: TargetAnalyticsCollectionState.FAILED,
      },
      where: {
        ...this.targetWhere(target),
        analyticsCollectionAttemptKey: target.attemptKey,
      },
    });
  }

  async markFailedBatch(
    targets: AnalyticsCollectionAttemptRef[],
    failure: AnalyticsCollectionFailure,
  ): Promise<void> {
    await Promise.all(
      targets.map((target) => this.markFailed(target, failure)),
    );
  }

  private targetWhere(target: AnalyticsCollectionTargetRef) {
    return scopedWhere(target.organizationId, {
      brandId: target.brandId,
      groupId: { not: null },
      id: target.id,
      parentId: null,
      platform: target.platform,
    });
  }
}
