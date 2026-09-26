import { resolveVisionGateMode } from '@api/services/media-assessment/media-gate.settings';
import {
  hasPendingArtefacts,
  MEDIA_PERCEPTION_SELECT,
  toMediaPerception,
} from '@api/services/media-perception/media-perception.record';
import { resolveMediaKind } from '@api/services/media-readiness/media-kind.util';
import {
  readBlockingDiagnostics,
  readWarningDiagnostics,
} from '@api/services/media-readiness/media-readiness.evaluator';
import { MediaReadinessService } from '@api/services/media-readiness/media-readiness.service';
import {
  MEDIA_MODERATION_SELECT,
  toMediaModeration,
} from '@api/services/moderation/media-moderation.record';
import { resolveModerationSettings } from '@api/services/moderation/moderation.settings';
import {
  applyModerationMode,
  evaluateModerationVerdict,
} from '@api/services/moderation/moderation-verdict.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type {
  MediaAssessment,
  MediaAssessmentReason,
  MediaReadinessReport,
} from '@genfeedai/contracts/api-types/contracts';
import type { AgentPublishMediaAssessment } from '@genfeedai/contracts/api-types/contracts/agent-publish-policy.contract';
import type {
  IEvaluationData,
  IMediaPublishGate,
  IMediaReadinessRequest,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Injectable } from '@nestjs/common';

const CHECKS_PENDING_MESSAGE =
  'Media checks are still running for this asset; it needs review until they finish.';

/** The slice of an assessment the publish policy consumes. */
export function toPolicyMediaAssessment(
  assessment: MediaAssessment,
): AgentPublishMediaAssessment {
  return {
    isBlocking: assessment.isBlocking,
    reasons: Array.from(
      new Set(assessment.reasons.map((reason) => reason.message)),
    ),
  };
}

/**
 * Per-post media assessment (#4881): every media gate folded into one
 * tighten-only verdict for the publish policy and the publish card.
 *
 * - readiness `error` diagnostics (always on) block;
 * - a moderation verdict blocks only when it was classified in `live`
 *   (a shadow verdict is never flagged by construction);
 * - vision flags block only while `MEDIA_GATE_VISION_MODE=live`;
 * - an asset without settled perception is reported as pending, never as
 *   clean and never as blocking.
 *
 * Reads persisted results only — no classifier or model runs on the publish
 * path. With every source off it returns exactly "no reasons", which leaves
 * the publish policy's decision untouched.
 */
@Injectable()
export class MediaAssessmentService implements IMediaPublishGate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaReadinessService: MediaReadinessService,
    private readonly configService: ConfigService,
  ) {}

  evaluatePublishReadiness(
    request: IMediaReadinessRequest,
  ): Promise<MediaReadinessReport> {
    return this.mediaReadinessService.evaluatePublishReadiness(request);
  }

  async assessPublishMedia(
    request: IMediaReadinessRequest,
  ): Promise<MediaAssessment> {
    const assetIds = Array.from(new Set(request.assetIds)).filter(
      (assetId) => assetId.length > 0,
    );
    const reasons: MediaAssessmentReason[] = [];
    const warnings: MediaAssessmentReason[] = [];
    if (assetIds.length === 0) {
      return {
        isBlocking: false,
        isPerceptionPending: false,
        reasons,
        warnings,
      };
    }

    if (request.platforms.length > 0) {
      const report = await this.mediaReadinessService.evaluatePublishReadiness({
        ...request,
        assetIds,
      });
      for (const diagnostic of readBlockingDiagnostics(report)) {
        reasons.push({
          assetId: diagnostic.assetId,
          code: `readiness:${diagnostic.property}`,
          message: diagnostic.message,
          source: 'readiness',
        });
      }
      for (const diagnostic of readWarningDiagnostics(report)) {
        warnings.push({
          assetId: diagnostic.assetId,
          code: `readiness:${diagnostic.property}`,
          message: diagnostic.message,
          source: 'readiness',
        });
      }
    }

    // Classifier gates only apply to media; a text or source ingredient is
    // never perceived and must not read as "checks pending".
    const mediaAssetIds = await this.filterMediaAssets(
      request.organizationId,
      assetIds,
    );
    const unchecked = new Set<string>();
    const isPerceptionPending = await this.collectPerceptionAndVision(
      request.organizationId,
      mediaAssetIds,
      reasons,
      unchecked,
    );
    await this.collectModeration(
      request.organizationId,
      mediaAssetIds,
      reasons,
      unchecked,
    );
    for (const assetId of unchecked) {
      reasons.push({
        assetId,
        code: 'perception:checks_pending',
        message: CHECKS_PENDING_MESSAGE,
        source: 'perception',
      });
    }

    return {
      isBlocking: reasons.length > 0,
      isPerceptionPending,
      reasons,
      warnings,
    };
  }

  private async collectModeration(
    organizationId: string,
    assetIds: readonly string[],
    reasons: MediaAssessmentReason[],
    unchecked: Set<string>,
  ): Promise<void> {
    const settings = resolveModerationSettings(this.configService);
    if (settings.mode === 'off') {
      return;
    }
    const isClassifierLive =
      settings.mode === 'live' &&
      settings.provider !== 'none' &&
      String(this.configService.get('OPENAI_API_KEY') ?? '').trim().length > 0;
    const rows = await this.prisma.mediaModeration.findMany({
      select: MEDIA_MODERATION_SELECT,
      where: scopedWhere(organizationId, {
        ingredientId: { in: [...assetIds] },
      }),
    });
    if (isClassifierLive) {
      const moderated = new Set(rows.map((row) => row.ingredientId));
      for (const assetId of assetIds) {
        if (!moderated.has(assetId)) {
          unchecked.add(assetId);
        }
      }
    }
    for (const row of rows) {
      const moderation = toMediaModeration(row);
      if (!moderation) {
        continue;
      }
      // Stored scores under today's mode and thresholds: a verdict persisted
      // during shadow, or under older thresholds, is never trusted as-is.
      const verdict = applyModerationMode(
        evaluateModerationVerdict(moderation.inputs, settings.thresholds),
        settings.mode,
      );
      if (!verdict.isFlagged) {
        continue;
      }
      for (const category of verdict.flaggedCategories) {
        const top = verdict.triggers
          .filter((trigger) => trigger.category === category)
          .sort((a, b) => b.confidence - a.confidence)[0];
        const where =
          top?.frameIndex !== null && top?.frameIndex !== undefined
            ? `frame ${top.frameIndex + 1}`
            : (top?.source ?? 'asset');
        reasons.push({
          assetId: row.ingredientId,
          code: `moderation:${category}`,
          message: `Moderation flagged ${category.replace('_', ' ')} (${Math.round((top?.confidence ?? 0) * 100)}% on ${where}).`,
          source: 'moderation',
        });
      }
    }
  }

  private async filterMediaAssets(
    organizationId: string,
    assetIds: readonly string[],
  ): Promise<string[]> {
    const rows = await this.prisma.ingredient.findMany({
      select: { category: true, id: true },
      where: scopedWhere(organizationId, { id: { in: [...assetIds] } }),
    });
    return rows
      .filter((row) => resolveMediaKind(row.category) !== null)
      .map((row) => row.id);
  }

  /**
   * Returns whether any asset is still waiting on perception. While vision is
   * `live`, an asset without settled perception or without its evaluation is
   * added to `unchecked`.
   */
  private async collectPerceptionAndVision(
    organizationId: string,
    assetIds: readonly string[],
    reasons: MediaAssessmentReason[],
    unchecked: Set<string>,
  ): Promise<boolean> {
    const rows = await this.prisma.mediaPerception.findMany({
      select: { ...MEDIA_PERCEPTION_SELECT, visionEvaluationId: true },
      where: scopedWhere(organizationId, {
        ingredientId: { in: [...assetIds] },
      }),
    });
    const settled = new Set<string>();
    const evaluationByAsset = new Map<string, string>();
    const needsVision = new Set<string>();
    for (const row of rows) {
      const perception = toMediaPerception(row);
      if (perception && !hasPendingArtefacts(perception)) {
        settled.add(row.ingredientId);
      }
      if (row.visionEvaluationId) {
        evaluationByAsset.set(row.ingredientId, row.visionEvaluationId);
      } else if (perception?.framesStatus !== 'unavailable') {
        needsVision.add(row.ingredientId);
      }
    }

    const isVisionLive = resolveVisionGateMode(this.configService) === 'live';
    if (isVisionLive) {
      for (const assetId of assetIds) {
        if (!settled.has(assetId) || needsVision.has(assetId)) {
          unchecked.add(assetId);
        }
      }
    }

    if (isVisionLive && evaluationByAsset.size > 0) {
      const evaluations = await this.prisma.evaluation.findMany({
        select: { data: true, id: true },
        where: scopedWhere(organizationId, {
          id: { in: Array.from(new Set(evaluationByAsset.values())) },
        }),
      });
      const flagsById = new Map(
        evaluations.map((evaluation) => [
          evaluation.id,
          (evaluation.data as IEvaluationData | null)?.flags,
        ]),
      );
      for (const [assetId, evaluationId] of evaluationByAsset) {
        const flags = flagsById.get(evaluationId);
        if (!flags?.isFlagged) {
          continue;
        }
        for (const reason of flags.reasons) {
          reasons.push({
            assetId,
            code: `vision:${reason}`,
            message: `Vision review flagged ${reason.replace(/_/g, ' ')} (${flags.severity}).`,
            source: 'vision',
          });
        }
      }
    }

    return assetIds.some((assetId) => !settled.has(assetId));
  }
}
