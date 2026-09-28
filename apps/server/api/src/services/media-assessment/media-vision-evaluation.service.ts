import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { ContentQualityScorerService } from '@api/services/content-quality/content-quality-scorer.service';
import { resolveVisionGateMode } from '@api/services/media-assessment/media-gate.settings';
import { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  EvaluationSeverity,
  EvaluationType,
  IngredientCategory,
  Status,
} from '@genfeedai/contracts';
import { deriveVisionFlags } from '@genfeedai/contracts/api-types/contracts';
import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type {
  IEvaluationData,
  IMediaPerceptionCandidate,
} from '@genfeedai/contracts/interfaces';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

/** Frames shown to the vision model; enough to judge, cheap to send. */
const MAX_EVALUATED_FRAMES = 4;

/** Paid vision attempts per asset before the sweep stops offering it. */
export const MAX_VISION_ATTEMPTS = 3;

export type MediaVisionEvaluationOutcome =
  | 'evaluated'
  | 'failed'
  | 'reused'
  | 'skipped';

const SEVERITY: Record<'critical' | 'info' | 'warning', EvaluationSeverity> = {
  critical: EvaluationSeverity.CRITICAL,
  info: EvaluationSeverity.INFO,
  warning: EvaluationSeverity.WARNING,
};

/** Evenly pick at most `max` items, always keeping the first and last. */
export function pickEvenly<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) {
    return [...items];
  }
  return Array.from(
    { length: max },
    (_, index) => items[Math.round((index * (items.length - 1)) / (max - 1))],
  );
}

/**
 * Typed vision-evaluation flags per asset (#4881).
 *
 * Runs in the media-gates worker job after perception. The scorer grades a
 * bounded rubric over the perceived frames; flags are derived from the rubric
 * enums (never parsed from prose) and persisted on a pre-publication
 * `Evaluation` record, which the perception row links to. Identical bytes in
 * the same organization share one evaluation.
 *
 * The vision gate mode (an operator platform setting) `off` skips entirely; `shadow` and `live` both
 * evaluate — only the assessment decides whether flags gate a publish.
 */
@Injectable()
export class MediaVisionEvaluationService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaPerceptionService: MediaPerceptionService,
    private readonly scorer: ContentQualityScorerService,
    private readonly platformSettingsService: PlatformSettingsService,
    private readonly logger: LoggerService,
  ) {}

  async isActive(): Promise<boolean> {
    return (
      resolveVisionGateMode(
        await this.platformSettingsService.getFeatureSettings(),
      ) !== 'off'
    );
  }

  async evaluate(
    job: IMediaPerceptionCandidate,
  ): Promise<MediaVisionEvaluationOutcome> {
    if (!(await this.isActive())) {
      return 'skipped';
    }
    const perception = await this.mediaPerceptionService.getForAsset(
      job.organizationId,
      job.ingredientId,
    );
    if (
      perception?.framesStatus !== 'ready' ||
      perception.frames.length === 0
    ) {
      return 'skipped';
    }

    const link = await this.prisma.mediaPerception.findFirst({
      select: { id: true, visionAttempts: true, visionEvaluationId: true },
      where: scopedWhere(job.organizationId, {
        ingredientId: job.ingredientId,
      }),
    });
    if (
      !link ||
      link.visionEvaluationId ||
      link.visionAttempts >= MAX_VISION_ATTEMPTS
    ) {
      return 'skipped';
    }

    const reusedEvaluationId = await this.tryReuseSiblingEvaluation(
      job,
      perception.assetHash,
    );
    if (reusedEvaluationId) {
      await this.linkEvaluation(job, link.id, reusedEvaluationId);
      return 'reused';
    }

    const ingredient = await this.prisma.ingredient.findFirst({
      select: {
        brandId: true,
        category: true,
        organization: { select: { userId: true } },
        userId: true,
      },
      where: scopedWhere(job.organizationId, { id: job.ingredientId }),
    });
    // An evaluation needs an accountable user: the asset's creator, else the
    // organization owner.
    const userId = ingredient?.userId ?? ingredient?.organization?.userId;
    if (!ingredient || !userId) {
      return 'skipped';
    }

    let scoring: Awaited<
      ReturnType<ContentQualityScorerService['scoreVisionFrames']>
    >;
    try {
      scoring = await this.scorer.scoreVisionFrames({
        brandId: ingredient.brandId,
        imageUrls: pickEvenly(perception.frames, MAX_EVALUATED_FRAMES).map(
          (frame) => frame.url,
        ),
        organizationId: job.organizationId,
      });
    } catch (error: unknown) {
      // Record the paid attempt so a permanent failure is not re-billed on
      // every sweep; the asset stays unchecked (and gated while live).
      await this.prisma.mediaPerception.updateMany({
        data: { visionAttempts: { increment: 1 } },
        where: scopedWhere(job.organizationId, { id: link.id }),
      });
      this.logger.warn(
        `${this.constructorName} vision evaluation failed: ${getErrorMessage(error)}`,
        { attempts: link.visionAttempts + 1, ingredientId: job.ingredientId },
      );
      return 'failed';
    }
    const flags = deriveVisionFlags(scoring.rubric);
    const data: IEvaluationData = {
      analysis: {
        aiModel: LLM_DEFAULTS.fastText,
        strengths: [],
        suggestions: scoring.suggestions,
        weaknesses: scoring.feedback,
      },
      brandId: ingredient.brandId ?? undefined,
      evaluationType: EvaluationType.PRE_PUBLICATION,
      flags: {
        isFlagged: flags.isFlagged,
        reasons: flags.reasons,
        severity: SEVERITY[flags.severity],
      },
      overallScore: scoring.score,
      status: Status.COMPLETED,
      visionRubric: scoring.rubric,
    };

    const evaluation = await this.prisma.evaluation.create({
      data: {
        contentId: job.ingredientId,
        contentType:
          perception.kind === 'image'
            ? IngredientCategory.IMAGE
            : IngredientCategory.VIDEO,
        data: data as Prisma.InputJsonValue,
        organizationId: job.organizationId,
        userId,
      },
      select: { id: true },
    });
    await this.linkEvaluation(job, link.id, evaluation.id);

    if (flags.isFlagged) {
      this.logger.log(`${this.constructorName} vision flags raised`, {
        ingredientId: job.ingredientId,
        reasons: flags.reasons,
        severity: flags.severity,
      });
    }
    return 'evaluated';
  }

  /**
   * Perceived assets whose vision evaluation has not run yet, for the media
   * gates sweep. Cross-tenant by design; each job re-reads under its own
   * organization.
   */
  async findUnevaluatedAssets(
    since: Date,
    limit: number,
  ): Promise<IMediaPerceptionCandidate[]> {
    if (!(await this.isActive())) {
      return [];
    }
    // Queried from the ingredient side so deleted assets are excluded.
    const rows = await this.prisma.ingredient.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, organizationId: true },
      take: limit,
      where: {
        isDeleted: false,
        mediaPerceptions: {
          some: {
            framesStatus: 'ready',
            isDeleted: false,
            updatedAt: { gte: since },
            visionAttempts: { lt: MAX_VISION_ATTEMPTS },
            visionEvaluationId: null,
          },
        },
        organizationId: { not: null },
      },
    });
    return rows.flatMap((row) =>
      row.organizationId
        ? [{ ingredientId: row.id, organizationId: row.organizationId }]
        : [],
    );
  }

  /**
   * Reuses a sibling perception's evaluation for identical bytes, when the
   * sibling's link is still a live, org-scoped, non-deleted record. Returns
   * the evaluation id to link, or `null` when the caller should score fresh
   * frames instead — either no sibling exists, or its link was dangling.
   */
  private async tryReuseSiblingEvaluation(
    job: IMediaPerceptionCandidate,
    assetHash: string,
  ): Promise<string | null> {
    const sibling = await this.prisma.mediaPerception.findFirst({
      select: { id: true, visionEvaluationId: true },
      where: scopedWhere(job.organizationId, {
        assetHash,
        ingredientId: { not: job.ingredientId },
        visionEvaluationId: { not: null },
      }),
    });
    if (!sibling?.visionEvaluationId) {
      return null;
    }
    if (
      await this.hasValidEvaluation(
        job.organizationId,
        sibling.visionEvaluationId,
      )
    ) {
      return sibling.visionEvaluationId;
    }
    // `visionEvaluationId` is a plain string, not a DB foreign key, so a
    // soft-deleted (or otherwise gone) Evaluation leaves a dangling
    // reference behind. Reusing it would mark this asset "no flags" from a
    // result that no longer exists. Clear the sibling's dangling link too
    // — otherwise it stays permanently excluded from
    // `findUnevaluatedAssets` (which skips any non-null
    // `visionEvaluationId`) and never gets a real evaluation again. The
    // caller falls through to score fresh frames instead.
    // Compare-and-clear on the exact id we just validated: a concurrent
    // job could have already re-evaluated this sibling and linked a fresh
    // evaluation between our read and this write, and that newer valid
    // link must not be erased.
    await this.prisma.mediaPerception.updateMany({
      data: { visionEvaluationId: null },
      where: scopedWhere(job.organizationId, {
        id: sibling.id,
        visionEvaluationId: sibling.visionEvaluationId,
      }),
    });
    return null;
  }

  /** Whether an organization-scoped, non-deleted evaluation still exists. */
  private async hasValidEvaluation(
    organizationId: string,
    evaluationId: string,
  ): Promise<boolean> {
    const evaluation = await this.prisma.evaluation.findFirst({
      select: { id: true },
      where: scopedWhere(organizationId, { id: evaluationId }),
    });
    return evaluation !== null;
  }

  private async linkEvaluation(
    job: IMediaPerceptionCandidate,
    perceptionId: string,
    evaluationId: string,
  ): Promise<void> {
    await this.prisma.mediaPerception.updateMany({
      data: { visionEvaluationId: evaluationId },
      where: scopedWhere(job.organizationId, { id: perceptionId }),
    });
  }
}
