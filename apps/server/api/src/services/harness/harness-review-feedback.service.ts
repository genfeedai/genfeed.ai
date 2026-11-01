import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { resolveOptionalProvider } from '@api/helpers/utils/module-ref/resolve-optional-provider.util';
import { ReviewDecision } from '@genfeedai/contracts';
import type {
  IHarnessAvoidFeedbackEntry,
  IHarnessGoodFeedbackEntry,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

/** Label of the profile created when a brand has none at its first review. */
const FEEDBACK_PROFILE_LABEL = 'Brand harness';
/** Excerpt length cap for content copied into a harness anti-example. */
const AVOID_EXCERPT_MAX_LENGTH = 480;
/** Excerpt length cap for an approved draft copied into a positive example. */
const GOOD_EXCERPT_MAX_LENGTH = 480;
/** Reason length cap for the rejection note shown next to an anti-example. */
const AVOID_REASON_MAX_LENGTH = 240;
/** Total avoidFeedback entries kept per profile; oldest auto-added evicted first. */
const AVOID_FEEDBACK_CAP = 20;
/** Approved drafts kept as positive examples per profile; oldest evicted first. */
const GOOD_FEEDBACK_CAP = 5;

export type RecordReviewDecisionParams = {
  organizationId: string;
  /** No-ops (nothing to attach feedback to) when the reviewed content has no brand. */
  brandId?: string;
  decision: ReviewDecision;
  /** Full rejected/changed content; excerpted + capped before storage. */
  content: string;
  /** Reviewer-supplied rejection feedback, when present. */
  reason?: string;
  /** Reviewer who made the decision; stamps a profile created for the feedback. */
  userId?: string;
  /** Domain of the thing that was reviewed, e.g. `turbo_run_item`. */
  sourceType: string;
  /** ID of the thing that was reviewed, e.g. the batch item id. */
  sourceId: string;
};

/**
 * Feeds human review decisions on generated content back into the brand's
 * harness profile so future generations avoid repeating rejected patterns.
 *
 * `rejected` / `request_changes` are recorded in the active harness profile's
 * `avoidFeedback` audit trail (excerpt, reason, source stamp, timestamp). That
 * trail feeds the learning signals and evals but is never read when generating,
 * so a rejection does not change future drafts on its own: the review panel
 * suggests a short brand rule and the reviewer saves it, or not. A brand with
 * no active harness profile gets one so the record is not dropped.
 *
 * `approved` appends the approved draft to `examples.good`, newest first,
 * tracked via a parallel `goodFeedback` trail and capped at
 * `GOOD_FEEDBACK_CAP`. Callers only send it for drafts a person approved
 * without editing. Performance-based positive reinforcement stays with
 * `HarnessWinnerPromotionService`; the two trails never mix.
 *
 * Every call is fire-and-forget safe: failures are logged and swallowed so a
 * harness feedback write can never fail the review action that triggered it.
 */
@Injectable()
export class HarnessReviewFeedbackService {
  private readonly constructorName = String(this.constructor.name);
  /**
   * Tail of the write queue per brand. Every decision reads the profile,
   * merges its entry and writes the whole profile back, so decisions for one
   * brand (a batch approval fires one per item) must not interleave.
   */
  private readonly brandWriteTails = new Map<string, Promise<void>>();

  constructor(
    private readonly logger: LoggerService,
    @Optional()
    private readonly harnessProfilesService?: HarnessProfilesService,
    @Optional()
    private readonly moduleRef?: ModuleRef,
  ) {}

  async recordReviewDecision(
    params: RecordReviewDecisionParams,
  ): Promise<void> {
    try {
      await this.runSerializedPerBrand(params, () =>
        this.applyDecision(params),
      );
    } catch (error) {
      this.logger.error(
        `${this.constructorName} failed to record review feedback`,
        error,
        {
          brandId: params.brandId,
          organizationId: params.organizationId,
          sourceId: params.sourceId,
          sourceType: params.sourceType,
        },
      );
    }
  }

  private async runSerializedPerBrand(
    params: RecordReviewDecisionParams,
    work: () => Promise<void>,
  ): Promise<void> {
    if (!params.brandId) {
      return work();
    }

    const key = `${params.organizationId}:${params.brandId}`;
    const previous = this.brandWriteTails.get(key) ?? Promise.resolve();
    const run = previous.then(work);
    const tail = run.catch(() => undefined);
    this.brandWriteTails.set(key, tail);
    try {
      await run;
    } finally {
      if (this.brandWriteTails.get(key) === tail) {
        this.brandWriteTails.delete(key);
      }
    }
  }

  private async applyDecision(
    params: RecordReviewDecisionParams,
  ): Promise<void> {
    const isApproval = params.decision === ReviewDecision.APPROVED;
    if (
      !isApproval &&
      params.decision !== ReviewDecision.REJECTED &&
      params.decision !== ReviewDecision.REQUEST_CHANGES
    ) {
      // `unset` no-ops here.
      return;
    }

    if (!params.brandId) {
      return;
    }

    const content = params.content?.trim();
    if (!content) {
      return;
    }

    const harnessProfilesService = this.resolveHarnessProfilesService();
    if (!harnessProfilesService) {
      this.logger.warn(
        `${this.constructorName} harness profiles service unavailable`,
        {
          organizationId: params.organizationId,
          sourceId: params.sourceId,
          sourceType: params.sourceType,
        },
      );
      return;
    }

    const profile =
      (await harnessProfilesService.getActiveForBrand(
        params.organizationId,
        params.brandId,
      )) ??
      (await harnessProfilesService.create(
        {
          brandId: params.brandId,
          isDefault: true,
          label: FEEDBACK_PROFILE_LABEL,
          scope: 'brand',
          status: 'active',
        },
        params.organizationId,
        params.userId,
      ));

    const source = `${params.sourceType}:${params.sourceId}`;
    if (isApproval) {
      await this.recordApproval(
        harnessProfilesService,
        profile,
        params,
        content,
      );
      return;
    }

    const existingFeedback = profile.avoidFeedback ?? [];
    if (existingFeedback.some((entry) => entry.source === source)) {
      // Already recorded for this exact review decision — dedupe by source.
      return;
    }

    const entry: IHarnessAvoidFeedbackEntry = {
      addedAt: new Date().toISOString(),
      content: truncateExcerpt(content, AVOID_EXCERPT_MAX_LENGTH),
      isAutoAdded: true,
      reason:
        truncateExcerpt(params.reason?.trim() ?? '', AVOID_REASON_MAX_LENGTH) ||
        undefined,
      source,
    };

    const cappedFeedback = capAutoAddedFeedback(
      [...existingFeedback, entry],
      AVOID_FEEDBACK_CAP,
    );

    // Only the audit trail is written. What generation reads (`examples.avoid`,
    // `guardrails`) changes when the reviewer accepts a suggested brand rule.
    await harnessProfilesService.update(
      profile.id,
      { avoidFeedback: cappedFeedback },
      params.organizationId,
    );

    this.logger.log(
      `${this.constructorName} recorded rejection from review decision`,
      {
        brandId: params.brandId,
        decision: params.decision,
        organizationId: params.organizationId,
        profileId: profile.id,
        source,
      },
    );
  }

  private async recordApproval(
    harnessProfilesService: HarnessProfilesService,
    profile: Awaited<ReturnType<HarnessProfilesService['getActiveForBrand']>>,
    params: RecordReviewDecisionParams,
    content: string,
  ): Promise<void> {
    if (!profile) {
      return;
    }

    const source = `${params.sourceType}:${params.sourceId}`;
    const existingFeedback = profile.goodFeedback ?? [];
    if (existingFeedback.some((entry) => entry.source === source)) {
      return;
    }

    const entry: IHarnessGoodFeedbackEntry = {
      addedAt: new Date().toISOString(),
      content: truncateExcerpt(content, GOOD_EXCERPT_MAX_LENGTH),
      source,
    };
    const cappedFeedback = [...existingFeedback, entry]
      .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
      .slice(0, GOOD_FEEDBACK_CAP);

    // Good strings never tracked by a feedback entry are operator/seed-curated
    // — keep them first and uncapped, then the approvals, newest first.
    const curatedGood = (profile.examples?.good ?? []).filter(
      (item) => !existingFeedback.some((fb) => fb.content === item),
    );
    const nextGood = dedupeAvoidList([
      ...curatedGood,
      ...cappedFeedback.map((fb) => fb.content),
    ]);

    await harnessProfilesService.update(
      profile.id,
      {
        examples: { good: nextGood },
        goodFeedback: cappedFeedback,
      },
      params.organizationId,
    );

    this.logger.log(
      `${this.constructorName} recorded positive example from approved draft`,
      {
        brandId: params.brandId,
        organizationId: params.organizationId,
        profileId: profile.id,
        source,
      },
    );
  }

  private resolveHarnessProfilesService(): HarnessProfilesService | undefined {
    if (this.harnessProfilesService) {
      return this.harnessProfilesService;
    }
    return resolveOptionalProvider(this.moduleRef, HarnessProfilesService);
  }
}

function truncateExcerpt(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

/**
 * Keeps the total entry count at `cap`, evicting the oldest auto-added
 * entries first. Human-curated entries (`isAutoAdded: false`) are never
 * evicted, even if that leaves the list above `cap`.
 */
function capAutoAddedFeedback(
  entries: IHarnessAvoidFeedbackEntry[],
  cap: number,
): IHarnessAvoidFeedbackEntry[] {
  if (entries.length <= cap) {
    return entries;
  }

  const oldestFirst = [...entries].sort((a, b) =>
    a.addedAt.localeCompare(b.addedAt),
  );
  const result = [...entries];

  for (const candidate of oldestFirst) {
    if (result.length <= cap) {
      break;
    }
    if (!candidate.isAutoAdded) {
      continue;
    }
    const index = result.indexOf(candidate);
    if (index >= 0) {
      result.splice(index, 1);
    }
  }

  return result;
}

function dedupeAvoidList(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}
