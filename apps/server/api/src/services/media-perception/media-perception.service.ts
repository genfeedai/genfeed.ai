import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  hasPendingArtefacts,
  MEDIA_PERCEPTION_SELECT,
  type MediaPerceptionRow,
  toMediaPerception,
} from '@api/services/media-perception/media-perception.record';
import {
  type MediaPerceptionSettings,
  resolveMediaPerceptionSettings,
} from '@api/services/media-perception/media-perception.settings';
import { MediaPerceptionDescriberService } from '@api/services/media-perception/media-perception-describer.service';
import {
  MEDIA_INGREDIENT_CATEGORIES,
  resolveMediaKind,
} from '@api/services/media-readiness/media-kind.util';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { MediaVendorCostLedgerService } from '@api/services/media-vendor-cost/media-vendor-cost-ledger.service';
import { WhisperService } from '@api/services/whisper/whisper.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { IngredientStatus } from '@genfeedai/contracts';
import {
  MEDIA_PERCEPTION_SCHEMA_VERSION,
  type MediaPerceptionArtefactStatus,
  type MediaPerceptionArtefacts,
  type MediaPerceptionDiagnostic,
  type MediaPerceptionFrame,
  type MediaPerceptionTranscript,
  type MediaReadinessKind,
  type MediaSceneDescription,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  IMediaPerception,
  IMediaPerceptionCandidate,
  IMediaPerceptionLookup,
  MediaPerceptionOutcome,
} from '@genfeedai/contracts/interfaces';
import {
  MEDIA_PERCEPTION_MAX_ATTEMPTS,
  MEDIA_PERCEPTION_RETRY_BASE_DELAY_MS,
  type MediaPerceptionJobData,
} from '@genfeedai/contracts/queue';
import { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { readIngredientMediaUrlWithFallback } from '@libs/media/media-url.util';
import { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

/** Ingredient states whose media is final and worth perceiving. */
const PERCEIVABLE_STATUSES = [
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
];

type PerceivableIngredient = {
  brandId: string | null;
  id: string;
  kind: MediaReadinessKind;
  url: string;
};

type PendingResolution = {
  description: MediaSceneDescription | null;
  descriptionModel: string | null;
  descriptionStatus: MediaPerceptionArtefactStatus;
  diagnostics: MediaPerceptionDiagnostic[];
  transcript: MediaPerceptionTranscript | null;
  transcriptStatus: MediaPerceptionArtefactStatus;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Nullable Json columns take `Prisma.DbNull`; a plain `null` is rejected. */
function toNullableJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined
    ? Prisma.DbNull
    : (value as Prisma.InputJsonValue);
}

function withDiagnostic(
  diagnostics: readonly MediaPerceptionDiagnostic[],
  next: MediaPerceptionDiagnostic,
): MediaPerceptionDiagnostic[] {
  const kept = diagnostics.filter(
    (entry) => !(entry.artefact === next.artefact && entry.code === next.code),
  );
  return [...kept, next];
}

/**
 * Media perception orchestration (#4879).
 *
 * Turns one asset into persisted text artefacts, once per asset hash:
 *
 * 1. fingerprint the bytes through the files service;
 * 2. reuse the artefacts of identical bytes already perceived in the same
 *    organization — no perception step runs twice for one hash;
 * 3. otherwise ask the files service for frames, OCR and the audio track, then
 *    transcribe and describe here.
 *
 * Transcript and description are the only provider calls. When either fails
 * the artefact stays `pending` with a backoff, so a vision outage never
 * discards the frames, OCR and transcript already persisted; after
 * {@link MEDIA_PERCEPTION_MAX_ATTEMPTS} it becomes `failed`.
 *
 * Runs from the workers queue only. Publish paths call {@link getForAssets},
 * which reads what exists and reports `isPerceptionPending` rather than waiting.
 */
@Injectable()
export class MediaPerceptionService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesClientService: FilesClientService,
    private readonly whisperService: WhisperService,
    private readonly describer: MediaPerceptionDescriberService,
    private readonly costLedger: MediaVendorCostLedgerService,
    private readonly mediaUrlService: MediaUrlService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  get settings(): MediaPerceptionSettings {
    return resolveMediaPerceptionSettings(this.configService);
  }

  async process(job: MediaPerceptionJobData): Promise<MediaPerceptionOutcome> {
    const ingredient = await this.loadIngredient(
      job.organizationId,
      job.ingredientId,
    );
    if (!ingredient) {
      await this.clearRetry(job);
      return 'skipped';
    }

    const existingRow = await this.prisma.mediaPerception.findFirst({
      select: MEDIA_PERCEPTION_SELECT,
      where: scopedWhere(job.organizationId, {
        ingredientId: job.ingredientId,
      }),
    });
    const existing = existingRow ? toMediaPerception(existingRow) : null;
    if (
      existingRow &&
      existing &&
      existing.schemaVersion === MEDIA_PERCEPTION_SCHEMA_VERSION
    ) {
      if (!hasPendingArtefacts(existing)) {
        return 'skipped';
      }
      await this.resolvePending(existingRow, existing, ingredient);
      return 'retried';
    }
    if (job.reason === 'retry') {
      // A row that no longer parses, or predates the current schema, is
      // re-perceived by the sweep — never retried in place.
      await this.clearRetry(job);
      return 'skipped';
    }

    const settings = this.settings;
    const { assetHash } = await this.filesClientService.fingerprintMedia(
      ingredient.url,
    );

    const reuse = await this.reuseIdenticalBytes(
      job.organizationId,
      ingredient,
      assetHash,
    );
    if (reuse === 'reused') {
      return 'reused';
    }
    if (reuse === 'deferred') {
      // Identical bytes are mid-perception elsewhere. No row is written, so
      // the sweep offers this asset again once the source has settled.
      return 'skipped';
    }

    const artefacts = await this.filesClientService.extractPerceptionArtefacts({
      assetHash,
      frameCount: settings.frameCount,
      kind: ingredient.kind,
      organizationId: job.organizationId,
      url: ingredient.url,
    });
    const row = await this.persistArtefacts(
      job.organizationId,
      ingredient,
      artefacts,
    );
    const record = toMediaPerception(row);
    if (record && hasPendingArtefacts(record)) {
      await this.resolvePending(row, record, ingredient);
    }
    return 'perceived';
  }

  /**
   * Perception for the assets a publish path is about to use. Never waits:
   * a missing record, or one with retryable artefacts, is reported as pending.
   */
  async getForAssets(
    organizationId: string,
    assetIds: readonly string[],
  ): Promise<IMediaPerceptionLookup[]> {
    const ids = Array.from(new Set(assetIds)).filter((id) => id.length > 0);
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.prisma.mediaPerception.findMany({
      select: MEDIA_PERCEPTION_SELECT,
      where: scopedWhere(organizationId, { ingredientId: { in: ids } }),
    });
    const byIngredient = new Map<string, IMediaPerception>();
    for (const row of rows) {
      const record = toMediaPerception(row);
      if (record) {
        byIngredient.set(row.ingredientId, {
          ...record,
          frames: record.frames.map((frame) => this.signFrame(frame)),
        });
      }
    }
    return ids.map((assetId) => {
      const perception = byIngredient.get(assetId) ?? null;
      return {
        assetId,
        isPerceptionPending: !perception || hasPendingArtefacts(perception),
        perception,
      };
    });
  }

  async getForAsset(
    organizationId: string,
    assetId: string,
  ): Promise<IMediaPerception | null> {
    const [lookup] = await this.getForAssets(organizationId, [assetId]);
    return lookup?.perception ?? null;
  }

  /**
   * Completed media assets created since `since` that have no perception
   * record yet. Deliberately cross-tenant: this feeds the workers sweep, and
   * every row it returns carries its own organization into the job.
   */
  async findUnperceivedAssets(
    since: Date,
    limit: number,
  ): Promise<IMediaPerceptionCandidate[]> {
    const rows = await this.prisma.ingredient.findMany({
      // Newest first: an asset that keeps failing ages out of the window
      // instead of holding the head of every batch.
      orderBy: { createdAt: 'desc' },
      select: { id: true, organizationId: true },
      take: limit,
      where: {
        category: { in: MEDIA_INGREDIENT_CATEGORIES },
        createdAt: { gte: since },
        isDeleted: false,
        // A record from an older schema version counts as missing.
        mediaPerceptions: {
          none: {
            isDeleted: false,
            schemaVersion: MEDIA_PERCEPTION_SCHEMA_VERSION,
          },
        },
        // Only assets whose media URL can be resolved: stored bytes, or
        // external media with an absolute link on its metadata.
        OR: [
          { s3Key: { not: null } },
          { metadata: { is: { result: { startsWith: 'http' } } } },
        ],
        organizationId: { not: null },
        status: { in: PERCEIVABLE_STATUSES },
      },
    });
    return rows.flatMap((row) =>
      row.organizationId
        ? [{ ingredientId: row.id, organizationId: row.organizationId }]
        : [],
    );
  }

  /** Records whose pending artefacts are due for another attempt. */
  async findDueRetries(
    now: Date,
    limit: number,
  ): Promise<IMediaPerceptionCandidate[]> {
    // Queried from the ingredient side so a deleted asset is never retried.
    const rows = await this.prisma.ingredient.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, organizationId: true },
      take: limit,
      where: {
        isDeleted: false,
        mediaPerceptions: {
          some: { isDeleted: false, nextAttemptAt: { lte: now } },
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

  private async loadIngredient(
    organizationId: string,
    ingredientId: string,
  ): Promise<PerceivableIngredient | null> {
    const row = await this.prisma.ingredient.findFirst({
      select: {
        brandId: true,
        category: true,
        cdnUrl: true,
        id: true,
        metadata: { select: { result: true } },
      },
      where: scopedWhere(organizationId, { id: ingredientId }),
    });
    const kind = resolveMediaKind(row?.category);
    const url = readIngredientMediaUrlWithFallback(row);
    if (!row || !kind || !url) {
      return null;
    }
    return { brandId: row.brandId ?? null, id: row.id, kind, url };
  }

  private async reuseIdenticalBytes(
    organizationId: string,
    ingredient: PerceivableIngredient,
    assetHash: string,
  ): Promise<'deferred' | 'none' | 'reused'> {
    const source = await this.prisma.mediaPerception.findFirst({
      orderBy: { createdAt: 'asc' },
      select: MEDIA_PERCEPTION_SELECT,
      where: scopedWhere(organizationId, {
        assetHash,
        ingredientId: { not: ingredient.id },
        schemaVersion: MEDIA_PERCEPTION_SCHEMA_VERSION,
      }),
    });
    const sourceRecord = source ? toMediaPerception(source) : null;
    if (!source || !sourceRecord) {
      return 'none';
    }
    if (hasPendingArtefacts(sourceRecord)) {
      return 'deferred';
    }

    const copied = {
      assetHash,
      attempts: source.attempts,
      audioUrl: source.audioUrl,
      description: toNullableJson(source.description),
      descriptionModel: source.descriptionModel,
      descriptionStatus: source.descriptionStatus,
      diagnostics: toJson(source.diagnostics),
      durationSeconds: source.durationSeconds,
      frames: toJson(source.frames),
      framesStatus: source.framesStatus,
      kind: source.kind,
      nextAttemptAt: null,
      ocr: toJson(source.ocr),
      ocrStatus: source.ocrStatus,
      isDeleted: false,
      reusedFromId: source.id,
      schemaVersion: source.schemaVersion,
      transcript: toNullableJson(source.transcript),
      transcriptStatus: source.transcriptStatus,
    };
    // tenant-scope-ignore: unique-key upsert; organizationId is part of the key, and a tombstoned row is revived (isDeleted reset) rather than colliding with it.
    await this.prisma.mediaPerception.upsert({
      create: { ...copied, ingredientId: ingredient.id, organizationId },
      update: copied,
      where: {
        organizationId_ingredientId: {
          ingredientId: ingredient.id,
          organizationId,
        },
      },
    });
    this.logger.log(`${this.constructorName} reused perception`, {
      ingredientId: ingredient.id,
      organizationId,
      reusedFromId: source.id,
    });
    return 'reused';
  }

  private async persistArtefacts(
    organizationId: string,
    ingredient: PerceivableIngredient,
    artefacts: MediaPerceptionArtefacts,
  ): Promise<MediaPerceptionRow> {
    const transcriptStatus: MediaPerceptionArtefactStatus = artefacts.audioUrl
      ? 'pending'
      : artefacts.diagnostics.some(
            (entry) => entry.code === 'audio_extraction_failed',
          )
        ? 'failed'
        : 'unavailable';
    const descriptionStatus: MediaPerceptionArtefactStatus =
      ingredient.kind === 'audio'
        ? 'unavailable'
        : artefacts.frames.length > 0
          ? 'pending'
          : 'failed';

    const data = {
      assetHash: artefacts.assetHash,
      attempts: 0,
      audioUrl: artefacts.audioUrl,
      description: Prisma.DbNull,
      descriptionModel: null,
      descriptionStatus,
      diagnostics: toJson(artefacts.diagnostics),
      durationSeconds: artefacts.durationSeconds,
      frames: toJson(artefacts.frames),
      framesStatus: artefacts.framesStatus,
      kind: artefacts.kind,
      nextAttemptAt: null,
      ocr: toJson(artefacts.ocr),
      isDeleted: false,
      ocrStatus: artefacts.ocrStatus,
      reusedFromId: null,
      schemaVersion: MEDIA_PERCEPTION_SCHEMA_VERSION,
      transcript: Prisma.DbNull,
      transcriptStatus,
    };
    // tenant-scope-ignore: unique-key upsert; organizationId is part of the key, and a tombstoned row is revived (isDeleted reset) rather than colliding with it.
    return this.prisma.mediaPerception.upsert({
      create: { ...data, ingredientId: ingredient.id, organizationId },
      select: MEDIA_PERCEPTION_SELECT,
      update: data,
      where: {
        organizationId_ingredientId: {
          ingredientId: ingredient.id,
          organizationId,
        },
      },
    });
  }

  /**
   * Attempt every `pending` provider artefact, then persist the outcome with
   * the next retry time — or mark what is still pending `failed` once the
   * attempt budget is spent.
   */
  private async resolvePending(
    row: MediaPerceptionRow,
    record: IMediaPerception,
    ingredient: PerceivableIngredient,
  ): Promise<void> {
    const resolution: PendingResolution = {
      description: record.description,
      descriptionModel: record.descriptionModel,
      descriptionStatus: record.descriptionStatus,
      diagnostics: [...record.diagnostics],
      transcript: record.transcript,
      transcriptStatus: record.transcriptStatus,
    };

    if (resolution.transcriptStatus === 'pending') {
      await this.resolveTranscript(row, ingredient, resolution);
    }
    if (resolution.descriptionStatus === 'pending') {
      await this.resolveDescription(record, ingredient, resolution);
    }

    const isStillPending =
      resolution.transcriptStatus === 'pending' ||
      resolution.descriptionStatus === 'pending';
    const attempts = isStillPending ? row.attempts + 1 : row.attempts;
    const isExhausted =
      isStillPending && attempts >= MEDIA_PERCEPTION_MAX_ATTEMPTS;

    if (isExhausted) {
      for (const artefact of ['transcript', 'description'] as const) {
        const key = `${artefact}Status` as const;
        if (resolution[key] === 'pending') {
          resolution[key] = 'failed';
          resolution.diagnostics = withDiagnostic(resolution.diagnostics, {
            artefact,
            code: 'retries_exhausted',
            message: `The ${artefact} could not be produced after ${attempts} attempts.`,
          });
        }
      }
    }

    const nextAttemptAt =
      isStillPending && !isExhausted
        ? new Date(
            Date.now() +
              MEDIA_PERCEPTION_RETRY_BASE_DELAY_MS * 2 ** (attempts - 1),
          )
        : null;

    await this.prisma.mediaPerception.updateMany({
      data: {
        attempts,
        description: toNullableJson(resolution.description),
        descriptionModel: resolution.descriptionModel,
        descriptionStatus: resolution.descriptionStatus,
        diagnostics: toJson(resolution.diagnostics),
        nextAttemptAt,
        transcript: toNullableJson(resolution.transcript),
        transcriptStatus: resolution.transcriptStatus,
      },
      where: scopedWhere(row.organizationId, { id: row.id }),
    });
  }

  private async resolveTranscript(
    row: MediaPerceptionRow,
    ingredient: PerceivableIngredient,
    resolution: PendingResolution,
  ): Promise<void> {
    if (!row.audioUrl) {
      resolution.transcriptStatus = 'failed';
      return;
    }
    try {
      const result = await this.whisperService.transcribeUrl(
        this.mediaUrlService.buildUrlFromAbsolute(row.audioUrl),
        'auto',
      );
      resolution.transcript = {
        durationSeconds:
          Number.isFinite(result.duration) && result.duration > 0
            ? result.duration
            : row.durationSeconds,
        language:
          result.language && result.language !== 'unknown'
            ? result.language
            : null,
        text: result.text.trim(),
      };
      resolution.transcriptStatus = 'ready';
      await this.recordTranscriptionSpend(
        row.organizationId,
        ingredient,
        resolution.transcript.durationSeconds,
      );
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} transcription failed: ${getErrorMessage(error)}`,
        { ingredientId: ingredient.id },
      );
      resolution.diagnostics = withDiagnostic(resolution.diagnostics, {
        artefact: 'transcript',
        code: 'transcription_unavailable',
        message: 'The transcription provider was unavailable; will retry.',
      });
    }
  }

  private async resolveDescription(
    record: IMediaPerception,
    ingredient: PerceivableIngredient,
    resolution: PendingResolution,
  ): Promise<void> {
    const model = this.settings.visionModel;
    try {
      resolution.description = await this.describer.describe({
        brandId: ingredient.brandId,
        durationSeconds: record.durationSeconds,
        frames: record.frames.map((frame) => this.signFrame(frame)),
        kind: record.kind,
        model,
        ocr: record.ocr,
        organizationId: record.organizationId,
        transcript: resolution.transcript?.text ?? null,
      });
      resolution.descriptionModel = model;
      resolution.descriptionStatus = 'ready';
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} scene description failed: ${getErrorMessage(error)}`,
        { ingredientId: ingredient.id },
      );
      resolution.diagnostics = withDiagnostic(resolution.diagnostics, {
        artefact: 'description',
        code: 'vision_model_unavailable',
        message: 'The vision model was unavailable; will retry.',
      });
    }
  }

  /**
   * Stored frame URLs are never handed out as-is: they are derived from the
   * object key (signed when this deployment signs media), matching the rule
   * that media URLs are derived per read, never persisted.
   */
  private signFrame(frame: MediaPerceptionFrame): MediaPerceptionFrame {
    return {
      ...frame,
      url: frame.storageKey
        ? this.mediaUrlService.buildUrl(frame.storageKey)
        : this.mediaUrlService.buildUrlFromAbsolute(frame.url),
    };
  }

  /** Stop a retry that cannot run from being re-queued every sweep. */
  private async clearRetry(job: MediaPerceptionJobData): Promise<void> {
    if (job.reason !== 'retry') {
      return;
    }
    await this.prisma.mediaPerception.updateMany({
      data: { nextAttemptAt: null },
      where: scopedWhere(job.organizationId, {
        ingredientId: job.ingredientId,
      }),
    });
  }

  /**
   * Transcription runs on Replicate's Whisper, which reports no per-call
   * price. The row still lands in the media vendor-cost ledger with its
   * realized duration so spend is attributable once a price is known.
   */
  private async recordTranscriptionSpend(
    organizationId: string,
    ingredient: PerceivableIngredient,
    durationSeconds: number | null,
  ): Promise<void> {
    try {
      await this.costLedger.record({
        brandId: ingredient.brandId,
        category: 'media-perception-transcription',
        costEvidence: 'unknown',
        isByok: false,
        model: 'openai/whisper',
        organizationId,
        pricingType: 'per-second',
        provider: 'replicate',
        units: durationSeconds ?? 0,
        vendorCostMicros: 0,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} transcription ledger write failed: ${getErrorMessage(error)}`,
        { ingredientId: ingredient.id },
      );
    }
  }
}
