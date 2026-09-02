import { HarnessProfilesService } from '@api/collections/harness-profiles/services/harness-profiles.service';
import { ReviewDecision } from '@genfeedai/contracts';
import type { IHarnessAvoidFeedbackEntry } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

/** Excerpt length cap for content copied into a harness anti-example. */
const AVOID_EXCERPT_MAX_LENGTH = 480;
/** Total avoidFeedback entries kept per profile; oldest auto-added evicted first. */
const AVOID_FEEDBACK_CAP = 20;

export type RecordReviewDecisionParams = {
  organizationId: string;
  /** No-ops (nothing to attach feedback to) when the reviewed content has no brand. */
  brandId?: string;
  decision: ReviewDecision;
  /** Full rejected/changed content; excerpted + capped before storage. */
  content: string;
  /** Reviewer-supplied rejection feedback, when present. */
  reason?: string;
  /** Domain of the thing that was reviewed, e.g. `batch_item`. */
  sourceType: string;
  /** ID of the thing that was reviewed, e.g. the batch item id. */
  sourceId: string;
};

/**
 * Feeds human review decisions on generated content back into the brand's
 * harness profile so future generations avoid repeating rejected patterns.
 *
 * `rejected` / `request_changes` append a normalized anti-example to the
 * active harness profile's `examples.avoid` list, tracked via a parallel
 * `avoidFeedback` audit trail (source stamp, reason, timestamp) so the cap/
 * eviction logic can tell auto-added entries apart from operator/seed
 * anti-examples and never evict the latter.
 *
 * `approved` is an intentional no-op here — positive reinforcement from
 * high-performing content is owned by `HarnessWinnerPromotionService`
 * (performance-winners promotion), not this pipeline.
 *
 * Every call is fire-and-forget safe: failures are logged and swallowed so a
 * harness feedback write can never fail the review action that triggered it.
 */
@Injectable()
export class HarnessReviewFeedbackService {
  private readonly constructorName = String(this.constructor.name);

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
      await this.applyDecision(params);
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

  private async applyDecision(
    params: RecordReviewDecisionParams,
  ): Promise<void> {
    if (
      params.decision !== ReviewDecision.REJECTED &&
      params.decision !== ReviewDecision.REQUEST_CHANGES
    ) {
      // `approved` (positive reinforcement lives in promote-winners) and
      // `unset` both no-op here.
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

    const profile = await harnessProfilesService.getActiveForBrand(
      params.organizationId,
      params.brandId,
    );
    if (!profile) {
      return;
    }

    const source = `${params.sourceType}:${params.sourceId}`;
    const existingFeedback = profile.avoidFeedback ?? [];
    if (existingFeedback.some((entry) => entry.source === source)) {
      // Already recorded for this exact review decision — dedupe by source.
      return;
    }

    const entry: IHarnessAvoidFeedbackEntry = {
      addedAt: new Date().toISOString(),
      content: truncateExcerpt(content, AVOID_EXCERPT_MAX_LENGTH),
      isAutoAdded: true,
      reason: params.reason?.trim() || undefined,
      source,
    };

    const cappedFeedback = capAutoAddedFeedback(
      [...existingFeedback, entry],
      AVOID_FEEDBACK_CAP,
    );

    // Avoid strings never tracked by a feedback entry predate this pipeline
    // (operator/seed-curated) — keep them untouched and uncapped.
    const humanAvoid = (profile.examples?.avoid ?? []).filter(
      (item) => !existingFeedback.some((fb) => fb.content === item),
    );
    const nextAvoid = dedupeAvoidList([
      ...humanAvoid,
      ...cappedFeedback.map((fb) => fb.content),
    ]);

    await harnessProfilesService.update(
      profile.id,
      {
        avoidFeedback: cappedFeedback,
        examples: { avoid: nextAvoid },
      },
      params.organizationId,
    );

    this.logger.log(
      `${this.constructorName} recorded avoid example from review decision`,
      {
        brandId: params.brandId,
        decision: params.decision,
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
    try {
      return this.moduleRef?.get(HarnessProfilesService, { strict: false });
    } catch {
      return undefined;
    }
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
