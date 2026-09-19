import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import {
  evaluateMediaReadiness,
  hasPlatformMediaSpecs,
} from '@api/services/media-readiness/media-readiness.evaluator';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { IngredientCategory } from '@genfeedai/contracts';
import {
  type MediaProbe,
  type MediaReadinessKind,
  type MediaReadinessReport,
  mediaProbeSchema,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  IMediaReadinessAsset,
  IMediaReadinessGate,
  IMediaReadinessRequest,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

/**
 * Deterministic pre-publish media readiness (#4878).
 *
 * Resolves the assets attached to a publish, reuses their persisted probe
 * metadata (probing once through the files service when an asset has none),
 * and evaluates every seeded platform media spec. No provider call and no
 * model call happens here — publish paths run this *before* dispatch so a
 * spec violation is reported instead of bounced back as a provider error.
 *
 * Probing is lazy rather than hooked into every upload and generation
 * completion: an ingredient reaches `GENERATED` from around twenty call sites,
 * and probing on first publish covers all of them — plus uploads, imports and
 * rows that predate this field — without adding a files-service round trip to
 * the upload path. The result is persisted on that first evaluation, so every
 * later publish of the same asset reads it back for free.
 */

/**
 * Which readiness kind each ingredient category is measured as. Categories
 * absent here carry no media the specs can constrain (text, source, …).
 */
const MEDIA_KIND_BY_CATEGORY: Partial<
  Record<IngredientCategory, MediaReadinessKind>
> = {
  [IngredientCategory.AUDIO]: 'audio',
  [IngredientCategory.AVATAR]: 'video',
  [IngredientCategory.GIF]: 'image',
  [IngredientCategory.IMAGE]: 'image',
  [IngredientCategory.IMAGE_EDIT]: 'image',
  [IngredientCategory.MUSIC]: 'audio',
  [IngredientCategory.VIDEO]: 'video',
  [IngredientCategory.VIDEO_EDIT]: 'video',
  [IngredientCategory.VOICE]: 'audio',
};

type LoadedAssets = {
  candidates: ProbeableAsset[];
  unresolvedAssetIds: string[];
};

type ProbeableAsset = {
  assetId: string;
  fileSize: number | null;
  kind: MediaReadinessKind;
  persistedProbe: MediaProbe | null;
  url: string | null;
};

const EMPTY_REPORT: Omit<MediaReadinessReport, 'checkedAt'> = {
  diagnostics: [],
  isBlocked: false,
};

@Injectable()
export class MediaReadinessService implements IMediaReadinessGate {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly filesClientService: FilesClientService,
    private readonly loggerService: LoggerService,
  ) {}

  async evaluatePublishReadiness(
    request: IMediaReadinessRequest,
  ): Promise<MediaReadinessReport> {
    const platforms = request.platforms.filter((platform) =>
      hasPlatformMediaSpecs(platform),
    );
    const assetIds = Array.from(new Set(request.assetIds)).filter(
      (assetId) => assetId.length > 0,
    );
    if (platforms.length === 0 || assetIds.length === 0) {
      return { ...EMPTY_REPORT, checkedAt: new Date().toISOString() };
    }

    const loaded = await this.loadAssets(request.organizationId, assetIds);
    const assets: IMediaReadinessAsset[] = [];
    for (const candidate of loaded.candidates) {
      assets.push({
        assetId: candidate.assetId,
        kind: candidate.kind,
        probe: await this.resolveProbe(request.organizationId, candidate),
      });
    }

    return evaluateMediaReadiness({
      assets,
      platforms,
      unresolvedAssetIds: loaded.unresolvedAssetIds,
    });
  }

  private async loadAssets(
    organizationId: string,
    assetIds: readonly string[],
  ): Promise<LoadedAssets> {
    const rows = await this.prisma.ingredient.findMany({
      select: {
        category: true,
        cdnUrl: true,
        fileSize: true,
        id: true,
        mediaProbe: true,
      },
      where: scopedWhere(organizationId, { id: { in: [...assetIds] } }),
    });

    // An id the tenant-scoped query did not return is unresolved. Rows it did
    // return but whose category carries no measurable media (text, source) are
    // resolved and simply have nothing to check — the two must not be
    // conflated, or a text attachment would block its own publish.
    const resolvedIds = new Set(rows.map((row) => row.id));
    const candidates = rows.flatMap((row) => {
      const kind = MEDIA_KIND_BY_CATEGORY[row.category as IngredientCategory];
      if (!kind) {
        return [];
      }
      return [
        {
          assetId: row.id,
          fileSize: row.fileSize ?? null,
          kind,
          persistedProbe: this.parsePersistedProbe(row.id, row.mediaProbe),
          url: row.cdnUrl ?? null,
        },
      ];
    });

    return {
      candidates,
      unresolvedAssetIds: assetIds.filter(
        (assetId) => !resolvedIds.has(assetId),
      ),
    };
  }

  private parsePersistedProbe(
    assetId: string,
    value: unknown,
  ): MediaProbe | null {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const parsed = mediaProbeSchema.safeParse(value);
    if (!parsed.success) {
      this.loggerService.warn(
        `${this.constructorName} discarding unreadable media probe`,
        { assetId },
      );
      return null;
    }
    return parsed.data;
  }

  /**
   * Reuse the persisted probe when present, otherwise probe once through the
   * files service and persist the result so later publishes are free.
   */
  private async resolveProbe(
    organizationId: string,
    asset: ProbeableAsset,
  ): Promise<MediaProbe | null> {
    if (asset.persistedProbe) {
      return asset.persistedProbe;
    }
    if (!asset.url) {
      return null;
    }

    let probe: MediaProbe;
    try {
      const probed = await this.filesClientService.probeMediaFromUrl(
        asset.url,
        asset.kind,
      );
      // ffprobe reports the size of what it downloaded; fall back to the
      // recorded upload size when the transport did not expose one.
      probe = {
        ...probed,
        sizeBytes: probed.sizeBytes ?? asset.fileSize,
      };
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} failed to probe asset media`,
        error,
        {
          assetId: asset.assetId,
          reason: getErrorMessage(error, {
            fallback: String,
            messageSource: 'error-instance',
          }),
        },
      );
      return null;
    }

    // Persistence is a cache write. Losing it costs a re-probe next time; it
    // must not downgrade a measurement we already hold into "unprobed".
    try {
      await this.persistProbe(organizationId, asset.assetId, probe);
    } catch (error: unknown) {
      this.loggerService.warn(
        `${this.constructorName} failed to persist asset media probe`,
        {
          assetId: asset.assetId,
          reason: getErrorMessage(error, {
            fallback: String,
            messageSource: 'error-instance',
          }),
        },
      );
    }
    return probe;
  }

  private async persistProbe(
    organizationId: string,
    assetId: string,
    probe: MediaProbe,
  ): Promise<void> {
    await this.prisma.ingredient.updateMany({
      data: {
        mediaProbe: probe,
        mediaProbedAt: new Date(probe.probedAt),
      },
      where: scopedWhere(organizationId, { id: assetId }),
    });
  }
}
