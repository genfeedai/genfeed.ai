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
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

/** Frames shown to the vision model; enough to judge, cheap to send. */
const MAX_EVALUATED_FRAMES = 4;

export type MediaVisionEvaluationOutcome = 'evaluated' | 'reused' | 'skipped';

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
 * `MEDIA_GATE_VISION_MODE=off` skips entirely; `shadow` and `live` both
 * evaluate — only the assessment decides whether flags gate a publish.
 */
@Injectable()
export class MediaVisionEvaluationService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaPerceptionService: MediaPerceptionService,
    private readonly scorer: ContentQualityScorerService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  get isActive(): boolean {
    return resolveVisionGateMode(this.configService) !== 'off';
  }

  async evaluate(
    job: IMediaPerceptionCandidate,
  ): Promise<MediaVisionEvaluationOutcome> {
    if (!this.isActive) {
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
      select: { id: true, visionEvaluationId: true },
      where: scopedWhere(job.organizationId, {
        ingredientId: job.ingredientId,
      }),
    });
    if (!link || link.visionEvaluationId) {
      return 'skipped';
    }

    const sibling = await this.prisma.mediaPerception.findFirst({
      select: { visionEvaluationId: true },
      where: scopedWhere(job.organizationId, {
        assetHash: perception.assetHash,
        ingredientId: { not: job.ingredientId },
        visionEvaluationId: { not: null },
      }),
    });
    if (sibling?.visionEvaluationId) {
      await this.linkEvaluation(job, link.id, sibling.visionEvaluationId);
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

    const scoring = await this.scorer.scoreVisionFrames({
      brandId: ingredient.brandId,
      imageUrls: pickEvenly(perception.frames, MAX_EVALUATED_FRAMES).map(
        (frame) => frame.url,
      ),
      organizationId: job.organizationId,
    });
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
    if (!this.isActive) {
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
