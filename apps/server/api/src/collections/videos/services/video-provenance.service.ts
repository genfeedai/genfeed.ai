import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { VideosService } from '@api/collections/videos/services/videos.service';
import { CategoryPrismaUtil } from '@api/helpers/utils/category-prisma/category-prisma.util';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import { buildMediaProvenancePackage } from '@genfeedai/helpers';
import type {
  IMediaProvenanceInput,
  IMediaProvenancePackage,
  IMetadataProvenanceRecord,
  IProvenanceScope,
  IVideoProvenanceRecord,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, NotFoundException } from '@nestjs/common';

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Video provenance export step (issue #31).
 *
 * Emits the canonical media package for a Genfeed video — a stable asset ID, a
 * transcript sidecar with timestamps, and a JSON manifest with canonical URLs
 * and generation metadata — assembled from the video's existing Ingredient,
 * Metadata, and Caption records. Pure assembly: no external generation or upload
 * side effects.
 */
@Injectable()
export class VideoProvenanceService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly videosService: VideosService,
    private readonly metadataService: MetadataService,
    private readonly captionsService: CaptionsService,
    private readonly loggerService: LoggerService,
  ) {}

  async buildProvenance(
    videoId: string,
    scope: IProvenanceScope = {},
  ): Promise<IMediaProvenancePackage> {
    this.loggerService.debug(`${this.constructorName} buildProvenance`, {
      videoId,
    });

    const orScopes: Record<string, unknown>[] = [];
    if (scope.userId) {
      orScopes.push({ user: scope.userId });
    }
    if (scope.organizationId) {
      orScopes.push({ organization: scope.organizationId });
    }

    // Refuse to run an unscoped lookup. Empty/missing user and org would
    // otherwise resolve any video by id regardless of ownership — a
    // cross-tenant leak. Treat the absence of any owner constraint as not found.
    if (orScopes.length === 0) {
      throw new NotFoundException(
        `${this.constructorName}: video ${videoId} not found`,
      );
    }

    const where: Record<string, unknown> = {
      OR: orScopes,
      _id: videoId,
      isDeleted: false,
    };

    return this.buildPackageFromVideoQuery(videoId, where);
  }

  async buildPublicProvenance(
    videoId: string,
  ): Promise<IMediaProvenancePackage> {
    this.loggerService.debug(`${this.constructorName} buildPublicProvenance`, {
      videoId,
    });

    return this.buildPackageFromVideoQuery(videoId, {
      _id: videoId,
      // buildWhereFromParams passes the value directly to Prisma which stores
      // IngredientCategory as uppercase (e.g. 'VIDEO'). The JS enum value is
      // lowercase ('video'), so we convert via CategoryPrismaUtil to avoid a
      // silent mismatch that would cause findOne to return null on valid records.
      category: CategoryPrismaUtil.toIngredientCategory(
        IngredientCategory.VIDEO,
      ),
      isDeleted: false,
      // scope and status are also Prisma enums stored as UPPERCASE. Convert from
      // the lowercase JS enum values to avoid the same silent WHERE mismatch.
      scope: CategoryPrismaUtil.toAssetScope(AssetScope.PUBLIC),
      status: CategoryPrismaUtil.toIngredientStatus(IngredientStatus.GENERATED),
    });
  }

  private async buildPackageFromVideoQuery(
    videoId: string,
    where: Record<string, unknown>,
  ): Promise<IMediaProvenancePackage> {
    const video = (await this.videosService.findOne(
      where,
    )) as unknown as IVideoProvenanceRecord | null;

    // Prisma returns IngredientCategory as its UPPERCASE stored form (e.g. 'VIDEO'),
    // while IngredientCategory.VIDEO in the JS enum is lowercase ('video').
    // Compare against the Prisma form to avoid rejecting valid video records.
    // Only reject when the category field is explicitly present AND is not VIDEO —
    // a missing category is already ruled out by the WHERE clause in the callers
    // that filter by category, but we keep the null-check for defensive coverage.
    const prismaVideoCategory = CategoryPrismaUtil.toIngredientCategory(
      IngredientCategory.VIDEO,
    );
    if (
      !video ||
      (video.category !== undefined && video.category !== prismaVideoCategory)
    ) {
      throw new NotFoundException(
        `${this.constructorName}: video ${videoId} not found`,
      );
    }

    const assetId = video.id ?? video._id ?? videoId;

    const metadata = video.metadataId
      ? ((await this.metadataService.findOne({
          _id: video.metadataId,
          isDeleted: false,
        })) as unknown as IMetadataProvenanceRecord | null)
      : null;

    const captions = (await this.captionsService.find({
      ingredient: videoId,
      isDeleted: false,
    })) as unknown as Array<{ content?: string | null }>;

    const transcriptText =
      captions.find(
        (caption) =>
          typeof caption.content === 'string' &&
          caption.content.trim().length > 0,
      )?.content ?? null;

    const input: IMediaProvenanceInput = {
      assetId,
      canonicalUrl: video.cdnUrl ?? null,
      contentHash: null,
      generatedAt: new Date().toISOString(),
      generation: {
        completedAt: toIsoString(video.generationCompletedAt),
        lora: video.loraUsed ?? null,
        model: video.modelUsed ?? null,
        negativePrompt: video.negativePrompt ?? null,
        prompt: video.generationPrompt ?? null,
        seed: video.generationSeed ?? null,
        source: video.generationSource ?? null,
        workflow: video.workflowUsed ?? null,
      },
      kind: 'video',
      language: video.language ?? null,
      media: metadata
        ? {
            durationSeconds: metadata.duration ?? null,
            fps: metadata.fps ?? null,
            hasAudio: metadata.hasAudio ?? null,
            height: metadata.height ?? null,
            resolution: metadata.resolution ?? null,
            width: metadata.width ?? null,
          }
        : null,
      mimeType: video.mimeType ?? null,
      sizeBytes: video.fileSize ?? null,
      storageKey: video.s3Key ?? null,
      transcript: transcriptText
        ? { language: video.language ?? null, text: transcriptText }
        : null,
    };

    return buildMediaProvenancePackage(input);
  }
}
