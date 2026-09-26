import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { MediaPerceptionService } from '@api/services/media-perception/media-perception.service';
import {
  MEDIA_MODERATION_SELECT,
  type MediaModerationRow,
  toMediaModeration,
} from '@api/services/moderation/media-moderation.record';
import {
  type ModerationSettings,
  resolveModerationSettings,
} from '@api/services/moderation/moderation.settings';
import { MODERATION_PROVIDER } from '@api/services/moderation/moderation.tokens';
import {
  applyModerationMode,
  evaluateModerationVerdict,
} from '@api/services/moderation/moderation-verdict.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  ActivityEntityModel,
  ActivityKey,
  ActivitySource,
  ModerationCategory,
} from '@genfeedai/contracts';
import type {
  ModerationInputResult,
  ModerationScores,
  ModerationVerdict,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  IMediaModeration,
  IMediaModerationLookup,
  IMediaPerception,
  IMediaPerceptionCandidate,
  IModerationProvider,
  MediaModerationOutcome,
} from '@genfeedai/contracts/interfaces';
import type { MediaModerationJobData } from '@genfeedai/contracts/queue';
import type { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Inject, Injectable } from '@nestjs/common';

/**
 * Hosted classifiers may score `sexual_minors` for text only. When perception
 * suspects minors in the asset, a visual input's sexual score also counts as
 * `sexual_minors`, so the strict minors threshold applies to it.
 */
export function withVisualMinorSafety(
  scores: ModerationScores,
  isMinorSuspected: boolean,
): ModerationScores {
  const sexual = scores[ModerationCategory.SEXUAL];
  if (!isMinorSuspected || sexual === undefined) {
    return scores;
  }
  return {
    ...scores,
    [ModerationCategory.SEXUAL_MINORS]: Math.max(
      scores[ModerationCategory.SEXUAL_MINORS] ?? 0,
      sexual,
    ),
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * Perception artefacts moderation reads. Classifying while any of them is
 * still `pending` would produce a verdict over partial evidence.
 */
function isReadyForModeration(perception: IMediaPerception): boolean {
  return (
    perception.framesStatus !== 'pending' &&
    perception.ocrStatus !== 'pending' &&
    perception.transcriptStatus !== 'pending'
  );
}

/**
 * Moderation classifier over perceived media (#4880).
 *
 * Inputs are the perception artefacts, never raw uploads: the original image
 * (its stored frame), every sampled video frame, the transcript and the OCR
 * text. The verdict is the maximum over inputs against per-category
 * thresholds; per-input scores are kept for the review UI.
 *
 * - `MODERATION_PROVIDER=none` (or no provider key): nothing is classified and
 *   no verdict is persisted, so every reader sees "no moderation" rather than
 *   an error.
 * - `shadow`: the result is persisted with `isFlagged=false`; what would have
 *   flagged is kept in `candidateVerdict` and logged.
 * - `live`: flagged results persist `isFlagged=true` and emit a
 *   `media-moderation-flagged` activity for the review inbox.
 *
 * Identical bytes are classified once per organization and provider; a second
 * asset re-evaluates the stored scores under the current thresholds and mode.
 */
@Injectable()
export class MediaModerationService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaPerceptionService: MediaPerceptionService,
    @Inject(MODERATION_PROVIDER)
    private readonly provider: IModerationProvider,
    private readonly activities: ActivitiesService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  get settings(): ModerationSettings {
    return resolveModerationSettings(this.configService);
  }

  /** Whether moderation runs at all on this deployment. */
  get isActive(): boolean {
    return this.provider.isEnabled && this.settings.mode !== 'off';
  }

  async moderate(job: MediaModerationJobData): Promise<MediaModerationOutcome> {
    if (!this.isActive) {
      return 'skipped';
    }
    const settings = this.settings;

    const perception = await this.mediaPerceptionService.getForAsset(
      job.organizationId,
      job.ingredientId,
    );
    if (!perception || !isReadyForModeration(perception)) {
      return 'skipped';
    }

    const ingredient = await this.prisma.ingredient.findFirst({
      select: { id: true },
      where: scopedWhere(job.organizationId, { id: job.ingredientId }),
    });
    if (!ingredient) {
      // Deleted after perception: nothing of it may leave the host.
      return 'skipped';
    }

    const existingRow = await this.prisma.mediaModeration.findFirst({
      select: MEDIA_MODERATION_SELECT,
      where: scopedWhere(job.organizationId, {
        ingredientId: job.ingredientId,
      }),
    });
    const existing = existingRow ? toMediaModeration(existingRow) : null;
    if (
      existing?.assetHash === perception.assetHash &&
      existing.provider === this.provider.name
    ) {
      // Same bytes, same vendor: never classify again, but a mode or
      // threshold change re-evaluates the stored scores.
      return this.isCurrent(existing, settings)
        ? 'skipped'
        : this.persistEvaluation(job, perception.assetHash, {
            inputs: existing.inputs,
            outcome: 'reevaluated',
            reusedFromId: existing.reusedFromId,
            settings,
          });
    }

    const reusable = await this.prisma.mediaModeration.findFirst({
      orderBy: { createdAt: 'asc' },
      select: MEDIA_MODERATION_SELECT,
      where: scopedWhere(job.organizationId, {
        assetHash: perception.assetHash,
        ingredientId: { not: job.ingredientId },
        provider: this.provider.name,
      }),
    });
    const reused = reusable ? toMediaModeration(reusable) : null;

    return this.persistEvaluation(job, perception.assetHash, {
      inputs: reused ? reused.inputs : await this.classify(perception),
      outcome: reused ? 'reused' : 'classified',
      reusedFromId: reused?.id ?? null,
      settings,
    });
  }

  /** Whether a stored record was evaluated under the current settings. */
  private isCurrent(
    moderation: IMediaModeration,
    settings: ModerationSettings,
  ): boolean {
    return (
      moderation.mode === settings.mode &&
      Object.values(ModerationCategory).every(
        (category) =>
          moderation.thresholds[category] === settings.thresholds[category],
      )
    );
  }

  private async persistEvaluation(
    job: MediaModerationJobData,
    assetHash: string,
    input: {
      inputs: ModerationInputResult[];
      outcome: MediaModerationOutcome;
      reusedFromId: string | null;
      settings: ModerationSettings;
    },
  ): Promise<MediaModerationOutcome> {
    const candidateVerdict = evaluateModerationVerdict(
      input.inputs,
      input.settings.thresholds,
    );
    const verdict = applyModerationMode(candidateVerdict, input.settings.mode);

    await this.persist(job, assetHash, {
      candidateVerdict,
      inputs: input.inputs,
      reusedFromId: input.reusedFromId,
      settings: input.settings,
      verdict,
    });

    if (verdict.isFlagged) {
      await this.emitFlaggedActivity(job, verdict);
    } else if (candidateVerdict.isFlagged) {
      this.logger.log(`${this.constructorName} shadow verdict would flag`, {
        flaggedCategories: candidateVerdict.flaggedCategories,
        ingredientId: job.ingredientId,
        organizationId: job.organizationId,
      });
    }
    return input.outcome;
  }

  async getForAssets(
    organizationId: string,
    assetIds: readonly string[],
  ): Promise<IMediaModerationLookup[]> {
    const ids = Array.from(new Set(assetIds)).filter((id) => id.length > 0);
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.mediaModeration.findMany({
      select: MEDIA_MODERATION_SELECT,
      where: scopedWhere(organizationId, { ingredientId: { in: ids } }),
    });
    const byIngredient = new Map<string, IMediaModeration>();
    for (const row of rows) {
      const record = toMediaModeration(row);
      if (record) {
        byIngredient.set(row.ingredientId, record);
      }
    }
    return ids.map((assetId) => ({
      assetId,
      moderation: byIngredient.get(assetId) ?? null,
    }));
  }

  async getForAsset(
    organizationId: string,
    assetId: string,
  ): Promise<IMediaModeration | null> {
    const [lookup] = await this.getForAssets(organizationId, [assetId]);
    return lookup?.moderation ?? null;
  }

  /**
   * Perceived assets with no moderation record yet, for the workers sweep.
   * Cross-tenant by design; each job re-reads under its own organization.
   */
  async findUnmoderatedAssets(
    since: Date,
    limit: number,
  ): Promise<IMediaPerceptionCandidate[]> {
    if (!this.isActive) {
      return [];
    }
    // tenant-scope-ignore: administrative discovery reads tenant identifiers only; each queued job re-reads its rows under its own organization scope.
    return this.prisma.mediaPerception.findMany({
      // Newest first: an asset that keeps failing ages out of the window
      // instead of holding the head of every batch.
      orderBy: { updatedAt: 'desc' },
      select: { ingredientId: true, organizationId: true },
      take: limit,
      where: {
        framesStatus: { not: 'pending' },
        ingredient: {
          isDeleted: false,
          mediaModerations: { none: { isDeleted: false } },
        },
        isDeleted: false,
        ocrStatus: { not: 'pending' },
        transcriptStatus: { not: 'pending' },
        updatedAt: { gte: since },
      },
    });
  }

  private async classify(
    perception: IMediaPerception,
  ): Promise<ModerationInputResult[]> {
    const inputs: ModerationInputResult[] = [];

    const isMinorSuspected =
      perception.description?.hasSuspectedMinors === true;
    if (perception.kind === 'image' && perception.frames[0]) {
      inputs.push({
        frameIndex: null,
        scores: withVisualMinorSafety(
          await this.provider.classifyImage(perception.frames[0].url),
          isMinorSuspected,
        ),
        source: 'image',
      });
    } else if (perception.kind === 'video' && perception.frames.length > 0) {
      const frameScores = await this.provider.classifyFrames(
        perception.frames.map((frame) => frame.url),
      );
      perception.frames.forEach((frame, position) => {
        inputs.push({
          frameIndex: frame.index,
          scores: withVisualMinorSafety(
            frameScores[position] ?? {},
            isMinorSuspected,
          ),
          source: 'frame',
        });
      });
    }

    const transcript = perception.transcript?.text.trim();
    if (perception.transcriptStatus === 'ready' && transcript) {
      inputs.push({
        frameIndex: null,
        scores: await this.provider.classifyText(transcript),
        source: 'transcript',
      });
    }

    const onScreenText = perception.ocr
      .map((entry) => entry.text.trim())
      .filter((text) => text.length > 0)
      .join('\n');
    if (onScreenText) {
      inputs.push({
        frameIndex: null,
        scores: await this.provider.classifyText(onScreenText),
        source: 'ocr',
      });
    }

    return inputs;
  }

  private async persist(
    job: MediaModerationJobData,
    assetHash: string,
    result: {
      candidateVerdict: ModerationVerdict;
      inputs: ModerationInputResult[];
      reusedFromId: string | null;
      settings: ModerationSettings;
      verdict: ModerationVerdict;
    },
  ): Promise<MediaModerationRow> {
    const data = {
      assetHash,
      candidateVerdict: toJson(result.candidateVerdict),
      flaggedCategories: result.verdict.flaggedCategories,
      inputs: toJson(result.inputs),
      isDeleted: false,
      isFlagged: result.verdict.isFlagged,
      maxConfidence: result.verdict.maxConfidence,
      mode: result.settings.mode,
      provider: this.provider.name,
      reusedFromId: result.reusedFromId,
      thresholds: toJson(result.settings.thresholds),
      verdict: toJson(result.verdict),
    };
    // tenant-scope-ignore: unique-key upsert; organizationId is part of the key, and a tombstoned row is revived (isDeleted reset) rather than colliding with it.
    return this.prisma.mediaModeration.upsert({
      create: {
        ...data,
        ingredientId: job.ingredientId,
        organizationId: job.organizationId,
      },
      select: MEDIA_MODERATION_SELECT,
      update: data,
      where: {
        organizationId_ingredientId: {
          ingredientId: job.ingredientId,
          organizationId: job.organizationId,
        },
      },
    });
  }

  /**
   * The review inbox entry. An asset without a brand has no inbox to land in;
   * the persisted verdict still gates its publish.
   */
  private async emitFlaggedActivity(
    job: MediaModerationJobData,
    verdict: ModerationVerdict,
  ): Promise<void> {
    try {
      const ingredient = await this.prisma.ingredient.findFirst({
        select: { brandId: true, userId: true },
        where: scopedWhere(job.organizationId, { id: job.ingredientId }),
      });
      if (!ingredient?.brandId) {
        return;
      }
      await this.activities.create({
        brandId: ingredient.brandId,
        entityId: job.ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.MEDIA_MODERATION_FLAGGED,
        organizationId: job.organizationId,
        source: ActivitySource.MEDIA_MODERATION,
        userId: ingredient.userId ?? undefined,
        value: JSON.stringify({
          flaggedCategories: verdict.flaggedCategories,
          ingredientId: job.ingredientId,
        }),
      });
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} flagged activity failed: ${getErrorMessage(error)}`,
        { ingredientId: job.ingredientId },
      );
    }
  }
}
