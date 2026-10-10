import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import type { PostCreateInput } from '@api/collections/posts/services/posts.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { scopedWhere } from '@api/index';
import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { TURBO_RUN_LEASE_STALE_MS } from '@api/services/turbo-run/turbo-run.constants';
import {
  resolveTurboRunItems,
  type TurboRunConfig,
  type TurboRunItemFull,
  type TurboRunProcessOptions,
  type TurboRunWithConfig,
} from '@api/services/turbo-run/turbo-run.types';
import { TurboRunAlreadyOwnedException } from '@api/services/turbo-run/turbo-run-already-owned.exception';
import {
  turboRunItemRowsInclude,
  type WriteTurboRunJsonAndItemRowsInput,
  writeTurboRunJsonAndItemRows,
} from '@api/services/turbo-run/turbo-run-item-rows';
import { TurboRunReviewService } from '@api/services/turbo-run/turbo-run-review.service';
import {
  fromPrismaTurboRunStatus,
  toPrismaTurboRunStatus,
} from '@api/services/turbo-run/turbo-run-status-prisma.mapper';
import { TurboRunSummaryService } from '@api/services/turbo-run/turbo-run-summary.service';
import {
  buildTurboRunDiversityContext,
  expandTurboRunTopics,
} from '@api/services/turbo-run/turbo-run-topic-angles.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { findOrThrow } from '@api/shared/utils/find-or-throw/find-or-throw.util';
import {
  AgentPublishDecision,
  ContentIntelligencePlatform,
  fromPrismaCredentialPlatform,
  PostVisibility,
  ReviewDecision,
  TargetExecutionState,
  TurboRunItemStatus,
  TurboRunStatus,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import type { ITurboRunSummary } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';

type TurboRunProcessingCounts = {
  cancelled: boolean;
  completedCount: number;
  failedCount: number;
};

/**
 * Result of trying to take ownership of a run run.
 * - `claimed` — fresh PENDING → PROCESSING transition
 * - `resumed` — re-claimed a PROCESSING run whose lease went stale
 * - `busy` — someone else owns it, or it is already terminal / missing
 */
type TurboRunClaimOutcome = 'busy' | 'claimed' | 'resumed';

/**
 * Fallback for platform ids the credential mapper does not recognise (product
 * ids with no credential platform, e.g. `product_hunt`). Canonical spellings
 * come from {@link fromPrismaCredentialPlatform} — this only normalises
 * separators and casing so an unmapped value is at least stored consistently.
 */
function toPostPlatform(platform: string): string {
  return platform.trim().toLowerCase().replace(/-/g, '_');
}

function toTurboRunItemFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown error';
  }

  const message = error.message;
  if (
    /Null constraint violation|Argument `.+` is missing|Invalid.*credentialId/i.test(
      message,
    )
  ) {
    const fieldMatch = message.match(/`([A-Za-z]+)`/);
    const field = fieldMatch?.[1];
    return field
      ? `Draft post create failed: missing or invalid "${field}". Connect a brand social account for this platform, or leave the draft untargeted.`
      : 'Draft post create failed due to a database constraint. Connect a brand social account for this platform, or leave the draft untargeted.';
  }

  const firstLine = message
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? message;
}

@Injectable()
export class TurboRunProcessingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly postsService: PostsService,
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly summaryService: TurboRunSummaryService,
    private readonly autonomousPublishPolicy: AutonomousPublishPolicyService,
    private readonly reviewService: TurboRunReviewService,
  ) {}

  async processTurboRun(
    turboRunId: string,
    orgId: string,
    options?: TurboRunProcessOptions,
  ): Promise<ITurboRunSummary> {
    const claim = await this.claimTurboRunForProcessing(turboRunId, orgId);

    if (claim === 'busy') {
      // Either the run doesn't exist for this org, or it's already being processed.
      const existing = await this.prisma.turboRun.findFirst({
        where: scopedWhere(orgId, { id: turboRunId }),
      });
      if (!existing) {
        throw new NotFoundException('TurboRun', turboRunId);
      }
      // Already generating or completed — return early without re-processing.
      throw new TurboRunAlreadyOwnedException(
        turboRunId,
        String(existing.status),
      );
    }

    const turboRunRecord = (await findOrThrow(
      this.prisma.turboRun,
      {
        include: turboRunItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: turboRunId }),
      },
      'TurboRun',
      turboRunId,
    )) as unknown as TurboRunWithConfig;

    // Copied, not aliased: the resume path below bumps `resumeCount` in place,
    // and writing that through to the fetched record would leave the caller
    // holding a row that disagrees with what was persisted.
    const turboRunConfig = {
      ...((turboRunRecord.config ?? {}) as TurboRunConfig),
    };
    const turboRunItems = resolveTurboRunItems(turboRunRecord);

    if (claim === 'resumed') {
      // The previous run died mid-run. Items it had started but never
      // persisted go back to PENDING so they are regenerated; items already
      // persisted as COMPLETED/FAILED are left alone, so neither the work nor
      // the credits for them are duplicated.
      for (const item of turboRunItems) {
        if (item.status === TurboRunItemStatus.PROCESSING) {
          item.status = TurboRunItemStatus.PENDING;
          item.error = undefined;
        }
      }
      turboRunConfig.resumeCount = (turboRunConfig.resumeCount ?? 0) + 1;

      this.logger.warn(`Resuming stranded run: ${turboRunId}`, {
        turboRunId,
        resumeCount: turboRunConfig.resumeCount,
      });
    }

    await this.invokeLifecycleCallback(
      'onTurboRunStarted',
      () =>
        options?.onTurboRunStarted?.({
          turboRunId,
          totalCount: turboRunConfig.totalCount ?? turboRunItems.length,
        }),
      { turboRunId },
    );

    const { cancelled, completedCount, failedCount } = await this.processItems(
      turboRunId,
      orgId,
      turboRunRecord,
      turboRunConfig,
      turboRunItems,
      options,
    );

    if (cancelled) {
      const cancelledTurboRun = await this.findScopedTurboRun(
        turboRunId,
        orgId,
      );
      return this.summaryService.toTurboRunSummary(cancelledTurboRun);
    }

    const totalCount = turboRunConfig.totalCount ?? turboRunItems.length;
    const finalStatus =
      failedCount === 0 && completedCount === totalCount
        ? TurboRunStatus.COMPLETED
        : completedCount > 0
          ? TurboRunStatus.PARTIAL
          : TurboRunStatus.FAILED;
    const updatedConfig: TurboRunConfig = {
      ...turboRunConfig,
      completedAt:
        finalStatus === TurboRunStatus.COMPLETED
          ? new Date().toISOString()
          : undefined,
      completedCount,
      failedCount,
    };

    const finalized = await this.persistGenerationState({
      turboRunId,
      brandId: turboRunRecord.brandId,
      extraTurboRunData: {
        config: updatedConfig as Prisma.InputJsonValue,
        status: toPrismaTurboRunStatus(finalStatus),
      },
      items: turboRunItems,
      organizationId: orgId,
      whereExtra: {
        status: toPrismaTurboRunStatus(TurboRunStatus.PROCESSING),
      },
    });

    if (finalized.count !== 1) {
      const currentTurboRun = await this.findScopedTurboRun(turboRunId, orgId);
      if (
        fromPrismaTurboRunStatus(String(currentTurboRun.status)) ===
        TurboRunStatus.CANCELLED
      ) {
        return this.summaryService.toTurboRunSummary(currentTurboRun);
      }
      throw new BadRequestException(
        `Turbo run ${turboRunId} changed state while processing`,
      );
    }

    if (turboRunRecord.agentStrategyId) {
      await this.approvePermittedDrafts(
        turboRunId,
        orgId,
        turboRunRecord.userId,
        turboRunItems,
      );
    }
    const updatedTurboRun = await this.findScopedTurboRun(turboRunId, orgId);
    await this.reportTurboRunComplete({
      turboRunId,
      completedCount,
      failedCount,
      finalStatus,
      options,
      totalCount,
    });
    return this.summaryService.toTurboRunSummary(updatedTurboRun);
  }

  private async reportTurboRunComplete(input: {
    turboRunId: string;
    completedCount: number;
    failedCount: number;
    finalStatus: TurboRunStatus;
    options?: TurboRunProcessOptions;
    totalCount: number;
  }): Promise<void> {
    this.logger.log(`Turbo run processing complete: ${input.turboRunId}`, {
      turboRunId: input.turboRunId,
      completedCount: input.completedCount,
      failedCount: input.failedCount,
      status: input.finalStatus,
    });
    await this.invokeLifecycleCallback(
      'onTurboRunCompleted',
      () =>
        input.options?.onTurboRunCompleted?.({
          turboRunId: input.turboRunId,
          completedCount: input.completedCount,
          failedCount: input.failedCount,
          status: input.finalStatus,
          totalCount: input.totalCount,
        }),
      { turboRunId: input.turboRunId },
    );
  }

  private async approvePermittedDrafts(
    turboRunId: string,
    orgId: string,
    userId: string,
    turboRunItems: TurboRunItemFull[],
  ): Promise<void> {
    for (const item of turboRunItems) {
      if (
        !item.postId ||
        !item.scheduledDate ||
        item.status !== TurboRunItemStatus.COMPLETED ||
        (item.reviewDecision && item.reviewDecision !== ReviewDecision.UNSET)
      )
        continue;
      const policy = await this.autonomousPublishPolicy.resolveForPost({
        organizationId: orgId,
        postId: item.postId,
      });
      if (policy.result.decision !== AgentPublishDecision.PERMITTED) continue;
      try {
        await this.reviewService.approveItems(
          turboRunId,
          [item.id],
          orgId,
          userId,
          true,
        );
      } catch (error) {
        this.logger.error(
          'Autonomous approval failed; draft remains in review',
          error,
          { turboRunId, postId: item.postId },
        );
      }
    }
  }

  private async processItems(
    turboRunId: string,
    orgId: string,
    turboRunRecord: TurboRunWithConfig,
    turboRunConfig: TurboRunConfig,
    turboRunItems: TurboRunItemFull[],
    options?: TurboRunProcessOptions,
  ): Promise<TurboRunProcessingCounts> {
    // Seed from what is already persisted so a resumed run keeps the totals of
    // the items its predecessor finished instead of restarting the count.
    let completedCount = turboRunItems.filter(
      (entry) => entry.status === TurboRunItemStatus.COMPLETED,
    ).length;
    let failedCount = turboRunItems.filter(
      (entry) => entry.status === TurboRunItemStatus.FAILED,
    ).length;

    // Accumulate captions as items complete — O(1) push per item instead of
    // re-scanning the full run on every generation call.
    const priorCaptions: string[] = turboRunItems
      .filter(
        (entry) =>
          entry.status === TurboRunItemStatus.COMPLETED &&
          Boolean(entry.caption?.trim()),
      )
      .map((entry) => entry.caption as string);

    // Empty/short topics → every item used `${format} content` and the model
    // rewrote the same brand hook N times. Expand once so each slot has a
    // distinct creative brief (user-supplied topics are kept first).
    const totalCount = turboRunConfig.totalCount ?? turboRunItems.length;
    const topics = expandTurboRunTopics({
      count: Math.max(totalCount, turboRunItems.length),
      formats: turboRunItems.map((entry) => entry.format),
      platforms: turboRunConfig.platforms ?? [],
      style: turboRunConfig.style,
      topics: turboRunConfig.topics,
    });
    turboRunConfig.topics = topics;

    for (let i = 0; i < turboRunItems.length; i++) {
      // Persist progress so far and renew the processing lease in one write.
      // A miss means the run was cancelled or re-claimed elsewhere — this
      // replaces the old read-only status probe at the same round-trip cost,
      // and is what makes a killed run resumable without losing finished items.
      const stillOwned = await this.persistItemProgress(
        turboRunId,
        orgId,
        turboRunRecord.brandId,
        turboRunConfig,
        turboRunItems,
        completedCount,
        failedCount,
      );
      if (!stillOwned) {
        return { cancelled: true, completedCount, failedCount };
      }

      const item = turboRunItems[i];

      if (item.status !== TurboRunItemStatus.PENDING) {
        continue;
      }

      try {
        item.status = TurboRunItemStatus.PROCESSING;

        const topic =
          topics[i] ??
          topics[i % Math.max(topics.length, 1)] ??
          `${item.format} content`;

        const postId = await this.generateTurboRunItemPost({
          turboRunConfig,
          turboRunId,
          turboRunRecord,
          completedCount,
          failedCount,
          index: i,
          item,
          options,
          orgId,
          priorCaptions,
          topic,
          totalCount,
        });
        item.postId = postId;
        item.status = TurboRunItemStatus.COMPLETED;
        completedCount++;
        if (item.caption?.trim()) {
          priorCaptions.push(item.caption);
        }

        await this.invokeLifecycleCallback(
          'onItemCompleted',
          () =>
            options?.onItemCompleted?.({
              turboRunId,
              completedCount,
              failedCount,
              index: i,
              item,
              postId,
              previewText: item.caption,
              topic,
              totalCount,
            }),
          { turboRunId, itemId: item.id },
        );
      } catch (error: unknown) {
        item.status = TurboRunItemStatus.FAILED;
        item.error = toTurboRunItemFailureMessage(error);
        failedCount++;

        this.logger.error(`Turbo run item ${item.id} failed: ${item.error}`, {
          turboRunId,
          itemId: item.id,
          rawError: error instanceof Error ? error.message : error,
        });

        await this.invokeLifecycleCallback(
          'onItemFailed',
          () =>
            options?.onItemFailed?.({
              turboRunId,
              completedCount,
              error: item.error,
              failedCount,
              index: i,
              item,
              topic:
                topics[i] ??
                topics[i % Math.max(topics.length, 1)] ??
                `${item.format} content`,
              totalCount,
            }),
          { turboRunId, itemId: item.id },
        );
      }
    }
    return { cancelled: false, completedCount, failedCount };
  }

  private async generateTurboRunItemPost(params: {
    turboRunConfig: TurboRunConfig;
    turboRunId: string;
    turboRunRecord: TurboRunWithConfig;
    completedCount: number;
    failedCount: number;
    index: number;
    item: TurboRunItemFull;
    options?: TurboRunProcessOptions;
    orgId: string;
    priorCaptions: string[];
    topic: string;
    totalCount: number;
  }): Promise<string> {
    const {
      turboRunConfig,
      turboRunId,
      turboRunRecord,
      completedCount,
      failedCount,
      index: i,
      item,
      options,
      orgId,
      priorCaptions,
      topic,
      totalCount,
    } = params;
    // Posts store lowercase platform strings; credentials use Prisma
    // CredentialPlatform SCREAMING_SNAKE — always map via the shared helper.
    // Reject unmappable platforms *before* content generation so a bad
    // persisted item cannot burn credits or create posts (#2696).
    const platformRaw =
      typeof item.platform === 'string' && item.platform.trim().length > 0
        ? item.platform.trim()
        : undefined;
    const platformForCredential = platformRaw
      ? toPrismaCredentialPlatform(platformRaw)
      : undefined;
    if (platformRaw && !platformForCredential) {
      throw new BadRequestException(
        `Invalid run item platform "${platformRaw}"`,
      );
    }

    await this.invokeLifecycleCallback(
      'onItemStarted',
      () =>
        options?.onItemStarted?.({
          turboRunId,
          completedCount,
          failedCount,
          index: i,
          item,
          topic,
          totalCount,
        }),
      { turboRunId, itemId: item.id },
    );

    const generated = await this.contentGeneratorService.generateContent(
      orgId,
      {
        additionalContext: buildTurboRunDiversityContext({
          index: i,
          priorCaptions,
          style: turboRunConfig.style,
          totalCount,
        }),
        brandId: turboRunRecord.brandId ?? undefined,
        platform: item.platform as ContentIntelligencePlatform,
        topic,
        variationsCount: 1,
      },
    );

    const content = generated[0];
    item.prompt = content?.content ?? topic;
    item.caption = content?.content ?? '';

    if (!turboRunRecord.brandId || !turboRunRecord.userId) {
      throw new BadRequestException(
        'Turbo run is missing brandId or userId; cannot create draft posts',
      );
    }

    const caption =
      item.caption?.trim() ||
      item.prompt?.trim() ||
      topic.trim() ||
      'Draft post';
    // Derive the post spelling from the same mapper the credential lookup
    // uses, so one item cannot persist a post platform that disagrees with
    // the credential it was matched against. Lowercasing the raw input
    // instead produced `dev_to` where the domain value is `devto`, and left
    // the alias `x` unresolved to `twitter` — two spellings for one
    // platform in `posts.platform`, which every downstream filter misses.
    const platformForPost =
      fromPrismaCredentialPlatform(platformForCredential) ??
      (platformRaw ? toPostPlatform(platformRaw) : undefined);

    // Pre-target the draft only when the answer is unambiguous. A brand may
    // hold several accounts on one platform, and a run item carries no
    // account of its own — picking whichever row the database returned
    // first would silently commit the draft to an account the operator
    // never chose. Two or more accounts leaves credentialId null; the
    // review queue is where the account gets picked. Fanning out here would
    // multiply the queue instead, which is the publish path's job.
    let credentialId: string | null = null;
    if (platformForCredential) {
      const credentials = await this.prisma.credential.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
        take: 2,
        where: scopedWhere(orgId, {
          brandId: turboRunRecord.brandId,
          isConnected: true,
          isDeleted: false,
          platform: platformForCredential,
        }),
      });
      credentialId =
        credentials.length === 1 ? (credentials[0]?.id ?? null) : null;
    }

    const post = await this.postsService.create({
      reviewTurboRunId: turboRunId,
      reviewItemId: item.id,
      agentStrategyId: turboRunRecord.agentStrategyId ?? undefined,
      brandId: turboRunRecord.brandId,
      ...(credentialId ? { credentialId } : {}),
      description: caption,
      ingredients: [],
      label: `Turbo run: ${topic}`.slice(0, 200),
      organizationId: orgId,
      platform: platformForPost,
      scheduledDate: item.scheduledDate
        ? new Date(item.scheduledDate)
        : undefined,
      targetExecutionState: TargetExecutionState.DRAFT,
      userId: turboRunRecord.userId,
      visibility: PostVisibility.PUBLIC,
    } as PostCreateInput);

    return String((post as Record<string, unknown>).id ?? post.id);
  }

  private async findScopedTurboRun(
    turboRunId: string,
    orgId: string,
  ): Promise<TurboRunWithConfig> {
    return (await findOrThrow(
      this.prisma.turboRun,
      {
        include: turboRunItemRowsInclude(orgId),
        where: scopedWhere(orgId, { id: turboRunId }),
      },
      'TurboRun',
      turboRunId,
    )) as unknown as TurboRunWithConfig;
  }

  /**
   * Take ownership of a run run.
   *
   * A fresh claim is the atomic PENDING → PROCESSING transition: if two callers
   * race, exactly one updateMany matches (count=1) and the other exits.
   *
   * The second attempt is the resume path. A run killed mid-run (API reload,
   * worker restart) leaves the row PROCESSING with nothing left to finish it,
   * which used to strand the run permanently. `updatedAt` acts as the lease —
   * every item persist bumps it — so filtering on it inside updateMany
   * re-claims a stale run atomically, and a still-live run (whose lease is
   * fresh) can never be stolen out from under itself.
   */
  private async claimTurboRunForProcessing(
    turboRunId: string,
    orgId: string,
  ): Promise<TurboRunClaimOutcome> {
    const claimed = await this.prisma.turboRun.updateMany({
      data: { status: toPrismaTurboRunStatus(TurboRunStatus.PROCESSING) },
      where: scopedWhere(orgId, {
        id: turboRunId,
        status: toPrismaTurboRunStatus(TurboRunStatus.PENDING),
      }),
    });
    if (claimed.count === 1) {
      return 'claimed';
    }

    const staleBefore = new Date(Date.now() - TURBO_RUN_LEASE_STALE_MS);
    const resumed = await this.prisma.turboRun.updateMany({
      data: { status: toPrismaTurboRunStatus(TurboRunStatus.PROCESSING) },
      where: scopedWhere(orgId, {
        id: turboRunId,
        status: toPrismaTurboRunStatus(TurboRunStatus.PROCESSING),
        updatedAt: { lt: staleBefore },
      }),
    });
    if (resumed.count === 1) {
      return 'resumed';
    }

    return 'busy';
  }

  /**
   * Write item results accumulated so far and renew the run lease.
   *
   * Returns false when the run is no longer ours — cancelled, or re-claimed
   * by another run — in which case the caller must stop without finalizing.
   */
  private async persistItemProgress(
    turboRunId: string,
    orgId: string,
    brandId: string | null | undefined,
    turboRunConfig: TurboRunConfig,
    turboRunItems: TurboRunItemFull[],
    completedCount: number,
    failedCount: number,
  ): Promise<boolean> {
    const progressConfig: TurboRunConfig = {
      ...turboRunConfig,
      completedCount,
      failedCount,
    };

    const persisted = await this.persistGenerationState({
      turboRunId,
      brandId,
      extraTurboRunData: {
        config: progressConfig as Prisma.InputJsonValue,
      },
      items: turboRunItems,
      organizationId: orgId,
      whereExtra: {
        status: toPrismaTurboRunStatus(TurboRunStatus.PROCESSING),
      },
    });

    return persisted.count === 1;
  }

  private async persistGenerationState(
    input: WriteTurboRunJsonAndItemRowsInput,
  ): Promise<{ count: number }> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(
        Prisma.sql`SELECT "id" FROM "turbo-runs" WHERE "id" = ${input.turboRunId} AND "organizationId" = ${input.organizationId} AND "isDeleted" = false FOR UPDATE`,
      );
      const turboRun = await transaction.turboRun.findFirst({
        include: turboRunItemRowsInclude(input.organizationId),
        where: scopedWhere(input.organizationId, { id: input.turboRunId }),
      });
      if (!turboRun) return { count: 0 };
      const currentItems = resolveTurboRunItems(turboRun);
      for (const item of input.items) {
        const current = currentItems.find(
          (candidate) => candidate.id === item.id,
        );
        if (
          !current ||
          (current.status !== TurboRunItemStatus.COMPLETED &&
            current.status !== TurboRunItemStatus.SKIPPED)
        )
          continue;
        Object.assign(item, {
          reviewDecision: current.reviewDecision,
          reviewFeedback: current.reviewFeedback,
          reviewedAt: current.reviewedAt,
          reviewEvents: current.reviewEvents,
          versionPinId: current.versionPinId,
          publishApproval: current.publishApproval,
          assigneeId: current.assigneeId,
          ...(current.status === TurboRunItemStatus.SKIPPED
            ? { status: TurboRunItemStatus.SKIPPED }
            : {}),
        });
      }
      return writeTurboRunJsonAndItemRows(transaction, input);
    });
  }

  private async invokeLifecycleCallback(
    callbackName: string,
    callback: (() => Promise<void> | void) | undefined,
    context: Record<string, unknown>,
  ): Promise<void> {
    if (!callback) return;

    try {
      await callback();
    } catch (error: unknown) {
      this.logger.error(`Turbo run lifecycle callback ${callbackName} failed`, {
        ...context,
        error,
      });
    }
  }
}
