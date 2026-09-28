import { PlatformFeatureSettingsService } from '@api/feature-flag/platform-feature-settings.service';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { hasPendingArtefacts } from '@api/services/media-perception/media-perception.record';
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
import {
  MODERATION_PROVIDERS,
  type ModerationProviders,
} from '@api/services/moderation/moderation.tokens';
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

/**
 * Fails closed: only a settled description that affirmatively found no
 * minors relaxes the visual threshold. A description that could not be
 * produced leaves minors unruled-out.
 */
function isMinorSuspected(perception: IMediaPerception): boolean {
  return perception.description?.hasSuspectedMinors !== false;
}

/**
 * Applies the perception's current minors evidence to visual inputs. Text
 * inputs are scored by the vendor as text and never change.
 */
function withCurrentMinorEvidence(
  inputs: readonly ModerationInputResult[],
  perception: IMediaPerception,
): ModerationInputResult[] {
  const isSuspected = isMinorSuspected(perception);
  return inputs.map((input) =>
    input.source === 'frame' || input.source === 'image'
      ? { ...input, scores: withVisualMinorSafety(input.scores, isSuspected) }
      : input,
  );
}

function hasSameMinorScores(
  stored: readonly ModerationInputResult[],
  current: readonly ModerationInputResult[],
): boolean {
  return stored.every(
    (input, index) =>
      input.scores[ModerationCategory.SEXUAL_MINORS] ===
      current[index]?.scores[ModerationCategory.SEXUAL_MINORS],
  );
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * Moderation classifier over perceived media (#4880).
 *
 * Inputs are the perception artefacts, never raw uploads: the original image
 * (its stored frame), every sampled video frame, the transcript and the OCR
 * text. The verdict is the maximum over inputs against per-category
 * thresholds; per-input scores are kept for the review UI.
 *
 * The provider, mode and thresholds are the `moderation` PostHog flag
 * (#5468), read per job so a change needs no restart.
 *
 * - provider `none` (or no provider key): nothing is classified and no
 *   verdict is persisted, so every reader sees "no moderation" rather than an
 *   error.
 * - `shadow`: the result is persisted with `isFlagged=false`; what would have
 *   flagged is kept in `candidateVerdict` and logged.
 * - `live`: flagged results persist `isFlagged=true` and emit a
 *   `media-moderation-flagged` activity for the review inbox.
 *
 * Identical bytes are classified once per organization and provider; a second
 * asset re-evaluates the stored scores under the current thresholds, mode and
 * minors evidence.
 */
@Injectable()
export class MediaModerationService {
  private readonly constructorName = String(this.constructor.name);
  private hasWarnedUnavailableProvider = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaPerceptionService: MediaPerceptionService,
    @Inject(MODERATION_PROVIDERS)
    private readonly providers: ModerationProviders,
    private readonly activityRecorder: ActivityRecorderService,
    private readonly featureSettingsService: PlatformFeatureSettingsService,
    private readonly logger: LoggerService,
  ) {}

  async getSettings(): Promise<ModerationSettings> {
    return resolveModerationSettings(
      await this.featureSettingsService.getFeatureSettings(),
    );
  }

  /** The bound classifier, or `null` when moderation does not run at all. */
  private activeProvider(
    settings: ModerationSettings,
  ): IModerationProvider | null {
    const provider = this.providers[settings.provider];
    if (!provider.isEnabled && settings.provider !== 'none') {
      this.warnUnavailableProviderOnce(settings.provider);
    }
    return provider.isEnabled && settings.mode !== 'off' ? provider : null;
  }

  /**
   * The flag chose a provider this deployment has no key for. It cannot be
   * refused where it is set (PostHog), so say so once per process instead.
   */
  private warnUnavailableProviderOnce(provider: string): void {
    if (this.hasWarnedUnavailableProvider) {
      return;
    }
    this.hasWarnedUnavailableProvider = true;
    this.logger.warn(
      `${this.constructorName} moderation flag selects ${provider}, which has no credential on this server; moderation is off`,
      { provider },
    );
  }

  async moderate(job: MediaModerationJobData): Promise<MediaModerationOutcome> {
    const settings = await this.getSettings();
    const provider = this.activeProvider(settings);
    if (!provider) {
      return 'skipped';
    }

    const perception = await this.mediaPerceptionService.getForAsset(
      job.organizationId,
      job.ingredientId,
    );
    // Every artefact must settle, the scene description included: its minors
    // evidence decides which threshold a visual sexual score is held to.
    if (!perception || hasPendingArtefacts(perception)) {
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
      existing.provider === provider.name
    ) {
      // Same bytes, same vendor: never classify again, but a mode, threshold
      // or minors-evidence change re-evaluates the stored scores.
      const inputs = withCurrentMinorEvidence(existing.inputs, perception);
      return this.isCurrent(existing, settings) &&
        hasSameMinorScores(existing.inputs, inputs)
        ? 'skipped'
        : this.persistEvaluation(job, perception.assetHash, {
            inputs,
            outcome: 'reevaluated',
            provider,
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
        provider: provider.name,
      }),
    });
    const reused = reusable ? toMediaModeration(reusable) : null;

    return this.persistEvaluation(job, perception.assetHash, {
      inputs: withCurrentMinorEvidence(
        reused ? reused.inputs : await this.classify(provider, perception),
        perception,
      ),
      outcome: reused ? 'reused' : 'classified',
      provider,
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
      provider: IModerationProvider;
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
      provider: input.provider,
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
    if (!this.activeProvider(await this.getSettings())) {
      return [];
    }
    // Queried from the ingredient side: deleted assets are excluded, and an
    // asset whose perception settled but has no moderation record qualifies.
    const rows = await this.prisma.ingredient.findMany({
      // Newest first: an asset that keeps failing ages out of the window
      // instead of holding the head of every batch.
      orderBy: { updatedAt: 'desc' },
      select: { id: true, organizationId: true },
      take: limit,
      where: {
        isDeleted: false,
        mediaModerations: { none: { isDeleted: false } },
        mediaPerceptions: {
          some: {
            descriptionStatus: { not: 'pending' },
            framesStatus: { not: 'pending' },
            isDeleted: false,
            ocrStatus: { not: 'pending' },
            transcriptStatus: { not: 'pending' },
            updatedAt: { gte: since },
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

  private async classify(
    provider: IModerationProvider,
    perception: IMediaPerception,
  ): Promise<ModerationInputResult[]> {
    const inputs: ModerationInputResult[] = [];

    if (perception.kind === 'image' && perception.frames[0]) {
      inputs.push({
        frameIndex: null,
        scores: await provider.classifyImage(perception.frames[0].url),
        source: 'image',
      });
    } else if (perception.kind === 'video' && perception.frames.length > 0) {
      const frameScores = await provider.classifyFrames(
        perception.frames.map((frame) => frame.url),
      );
      perception.frames.forEach((frame, position) => {
        inputs.push({
          frameIndex: frame.index,
          scores: frameScores[position] ?? {},
          source: 'frame',
        });
      });
    }

    const transcript = perception.transcript?.text.trim();
    if (perception.transcriptStatus === 'ready' && transcript) {
      inputs.push({
        frameIndex: null,
        scores: await provider.classifyText(transcript),
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
        scores: await provider.classifyText(onScreenText),
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
      provider: IModerationProvider;
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
      provider: result.provider.name,
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
      await this.activityRecorder.record({
        brandId: ingredient.brandId,
        entityId: job.ingredientId,
        entityModel: ActivityEntityModel.INGREDIENT,
        key: ActivityKey.MEDIA_MODERATION_FLAGGED,
        organizationId: job.organizationId,
        source: ActivitySource.MEDIA_MODERATION,
        userId: ingredient.userId ?? null,
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
