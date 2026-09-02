import { SERVER_TOKENS, type ServerPrisma } from '@api/server.dependencies';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { TargetAnalyticsCollectionState } from '@genfeedai/enums';
import type {
  AnalyticsCollectionAttemptRef,
  AnalyticsCollectionFailedTarget,
  AnalyticsCollectionFailure,
  AnalyticsCollectionTargetRef,
  ServerAnalyticsCollectionState,
} from '@genfeedai/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Inject, Injectable } from '@nestjs/common';
import {
  computeAnalyticsNextCollectAt,
  computeAnalyticsRetryCollectAt,
} from '../analytics-next-collect-at';

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

  private async publishedAtById(
    organizationId: string,
    ids: string[],
  ): Promise<Map<string, Date | null>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.post.findMany({
      select: { id: true, publishedAt: true },
      where: scopedWhere(organizationId, { id: { in: ids } }),
    });
    return new Map(rows.map((row) => [row.id, row.publishedAt]));
  }

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
      const ids = scopedTargets.map((target) => target.id);
      const publishedAtById = await this.publishedAtById(
        scope.organizationId,
        ids,
      );
      const idsByNextCollect = new Map<number, string[]>();

      for (const id of ids) {
        const nextCollectAt = computeAnalyticsNextCollectAt(
          collectedAt,
          publishedAtById.get(id),
        );
        const bucket = idsByNextCollect.get(nextCollectAt.getTime()) ?? [];
        bucket.push(id);
        idsByNextCollect.set(nextCollectAt.getTime(), bucket);
      }

      for (const [nextCollectAtMs, bucketIds] of idsByNextCollect.entries()) {
        await this.prisma.post.updateMany({
          data: {
            analyticsCollectedAt: collectedAt,
            analyticsCollectionAttemptKey: null,
            analyticsCollectionError: Prisma.DbNull,
            analyticsCollectionState: TargetAnalyticsCollectionState.READY,
            analyticsNextCollectAt: new Date(nextCollectAtMs),
          },
          where: {
            ...scopedWhere(scope.organizationId, {
              brandId: scope.brandId,
              groupId: { not: null },
              id: { in: bucketIds },
              parentId: null,
              platform: scope.platform,
            }),
            analyticsCollectionAttemptKey: scope.attemptKey,
          },
        });
      }
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
    await this.markFailedTargets(
      targets.map((target) => ({ ...target, failure })),
    );
  }

  /**
   * Writes one `updateMany` per (scope, failure) group.
   *
   * A per-post fetch loop fails each post for its own reason, which used to
   * mean one `markFailed` round trip per post. `classifyAnalyticsCollectionError`
   * only ever yields a handful of distinct failures per platform, so grouping
   * by identical classification collapses a whole batch into a few writes
   * without flattening which post failed how.
   */
  async markFailedTargets(
    targets: AnalyticsCollectionFailedTarget[],
  ): Promise<void> {
    const targetsByGroup = new Map<string, AnalyticsCollectionFailedTarget[]>();
    for (const target of targets) {
      if (!target.attemptKey) {
        continue;
      }
      // Serialized rather than delimiter-joined: failure messages are prose and
      // could otherwise smuggle the separator and merge two distinct groups.
      const groupKey = JSON.stringify([
        target.organizationId,
        target.brandId,
        target.platform,
        target.attemptKey,
        target.failure.code,
        target.failure.isRetryable,
        target.failure.message,
      ]);
      const groupedTargets = targetsByGroup.get(groupKey) ?? [];
      groupedTargets.push(target);
      targetsByGroup.set(groupKey, groupedTargets);
    }

    const failedAt = new Date();
    for (const groupedTargets of targetsByGroup.values()) {
      const [scope] = groupedTargets;
      if (!scope?.attemptKey) {
        continue;
      }
      await this.prisma.post.updateMany({
        data: {
          analyticsCollectionError: {
            code: scope.failure.code,
            failedAt: failedAt.toISOString(),
            isRetryable: scope.failure.isRetryable,
            message: scope.failure.message,
          },
          analyticsCollectionState: TargetAnalyticsCollectionState.FAILED,
          analyticsNextCollectAt: computeAnalyticsRetryCollectAt(
            failedAt,
            scope.failure.isRetryable,
          ),
        },
        where: {
          ...scopedWhere(scope.organizationId, {
            brandId: scope.brandId,
            groupId: { not: null },
            id: { in: groupedTargets.map((target) => target.id) },
            parentId: null,
            platform: scope.platform,
          }),
          analyticsCollectionAttemptKey: scope.attemptKey,
        },
      });
    }
  }
}
