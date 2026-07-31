import { TargetAnalyticsCollectionState } from '@genfeedai/enums';
import type {
  AnalyticsCollectionAttemptRef,
  AnalyticsCollectionFailure,
  AnalyticsCollectionTargetRef,
  ServerAnalyticsCollectionState,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Inject, Injectable } from '@nestjs/common';
import { SERVER_TOKENS, type ServerPrisma } from '@server/server.dependencies';
import { scopedWhere } from '@server/tenancy/scoped-where';

export interface MarkAnalyticsCollectionPendingInput {
  attemptKey: string;
  requestedAt: Date;
  targets: AnalyticsCollectionTargetRef[];
}

@Injectable()
export class PostAnalyticsCollectionStateService
  implements ServerAnalyticsCollectionState
{
  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: Pick<ServerPrisma, 'post'>,
  ) {}

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
    await this.markReadyBatch([target], collectedAt);
  }

  async markReadyBatch(
    targets: AnalyticsCollectionAttemptRef[],
    collectedAt = new Date(),
  ): Promise<void> {
    const targetsByScope = new Map<string, AnalyticsCollectionAttemptRef[]>();
    for (const target of targets) {
      if (!target.attemptKey) {
        continue;
      }
      const scopeKey = `${target.organizationId}:${target.brandId}:${target.platform}:${target.attemptKey}`;
      const scopedTargets = targetsByScope.get(scopeKey) ?? [];
      scopedTargets.push(target);
      targetsByScope.set(scopeKey, scopedTargets);
    }

    for (const scopedTargets of targetsByScope.values()) {
      const [scope] = scopedTargets;
      if (!scope?.attemptKey) {
        continue;
      }
      await this.prisma.post.updateMany({
        data: {
          analyticsCollectedAt: collectedAt,
          analyticsCollectionAttemptKey: null,
          analyticsCollectionError: Prisma.DbNull,
          analyticsCollectionState: TargetAnalyticsCollectionState.READY,
        },
        where: {
          ...scopedWhere(scope.organizationId, {
            brandId: scope.brandId,
            groupId: { not: null },
            id: { in: scopedTargets.map((target) => target.id) },
            parentId: null,
            platform: scope.platform,
          }),
          analyticsCollectionAttemptKey: scope.attemptKey,
        },
      });
    }
  }

  async markFailed(
    target: AnalyticsCollectionAttemptRef,
    failure: AnalyticsCollectionFailure,
  ): Promise<void> {
    await this.markFailedBatch([target], failure);
  }

  async markFailedBatch(
    targets: AnalyticsCollectionAttemptRef[],
    failure: AnalyticsCollectionFailure,
  ): Promise<void> {
    const targetsByScope = new Map<string, AnalyticsCollectionAttemptRef[]>();
    for (const target of targets) {
      if (!target.attemptKey) {
        continue;
      }
      const scopeKey = `${target.organizationId}:${target.brandId}:${target.platform}:${target.attemptKey}`;
      const scopedTargets = targetsByScope.get(scopeKey) ?? [];
      scopedTargets.push(target);
      targetsByScope.set(scopeKey, scopedTargets);
    }

    const failedAt = new Date().toISOString();
    for (const scopedTargets of targetsByScope.values()) {
      const [scope] = scopedTargets;
      if (!scope?.attemptKey) {
        continue;
      }
      await this.prisma.post.updateMany({
        data: {
          analyticsCollectionError: {
            code: failure.code,
            failedAt,
            isRetryable: failure.isRetryable,
            message: failure.message,
          },
          analyticsCollectionState: TargetAnalyticsCollectionState.FAILED,
        },
        where: {
          ...scopedWhere(scope.organizationId, {
            brandId: scope.brandId,
            groupId: { not: null },
            id: { in: scopedTargets.map((target) => target.id) },
            parentId: null,
            platform: scope.platform,
          }),
          analyticsCollectionAttemptKey: scope.attemptKey,
        },
      });
    }
  }
}
