import {
  remixMediaUrl,
  remixTruncate,
} from '@api/collections/content-runs/services/brand-remix-run-helpers';
import {
  GENERATION_READY_STATUSES,
  type ResolvedSource,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import { scopedWhere } from '@api/index';
import { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SharedService } from '@api/shared/services/shared/shared.service';
import {
  AssetScope,
  categoryToPlural,
  FileInputType,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type RemixSourceMediaIngestResult =
  | {
      assetId: string;
      category: IngredientCategory.IMAGE | IngredientCategory.VIDEO;
      status: 'saved';
    }
  | { status: 'skipped' }
  | {
      status: 'unavailable';
      reason:
        | 'import_not_permitted'
        | 'embed_only'
        | 'expired'
        | 'invalid_asset'
        | 'copy_failed';
    };

export interface RemixSourceMediaIngestInput {
  brandId: string;
  organizationId: string;
  source: ResolvedSource;
  userId: string;
}

/**
 * Copies remake source pixels through the same uploaded-ingredient path
 * Library file upload uses. Listing ads does not call this.
 */
@Injectable()
export class BrandRemixSourceMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesClientService,
    private readonly shared: SharedService,
    private readonly logger: LoggerService,
  ) {}

  async ingest(
    input: RemixSourceMediaIngestInput,
  ): Promise<RemixSourceMediaIngestResult> {
    if (input.source.sourceMedia?.existingAssetIds.length) {
      return this.resolveOwnedAsset(input);
    }

    const media = input.source.sourceMedia;
    if (!media || (!media.videoUrls.length && !media.imageUrls.length)) {
      return { status: 'skipped' };
    }
    if (input.source.snapshot.selector.kind === 'owned_post') {
      return { status: 'unavailable', reason: 'invalid_asset' };
    }
    if (media.importPolicy === 'embed_only') {
      return { status: 'unavailable', reason: 'embed_only' };
    }
    if (
      media.importPolicy !== 'permitted' ||
      !media.importPermissionRef ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(media.importPermissionRef)
    ) {
      return { status: 'unavailable', reason: 'import_not_permitted' };
    }
    if (
      media.importExpiresAt !== undefined &&
      (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
        media.importExpiresAt,
      ) ||
        !Number.isFinite(Date.parse(media.importExpiresAt)) ||
        Date.parse(media.importExpiresAt) <= Date.now())
    ) {
      return { status: 'unavailable', reason: 'expired' };
    }

    const videoUrl = remixMediaUrl(input.source.sourceMedia?.videoUrls[0]);
    const imageUrl = remixMediaUrl(input.source.sourceMedia?.imageUrls[0]);
    const url = videoUrl ?? imageUrl;
    if (!url) {
      return { status: 'unavailable', reason: 'invalid_asset' };
    }

    const category = videoUrl
      ? IngredientCategory.VIDEO
      : IngredientCategory.IMAGE;
    const sourceActionId = this.sourceActionId(input);
    const reused = await this.findReadySource(input, sourceActionId);
    if (reused) {
      return {
        assetId: reused.id,
        category:
          reused.category === IngredientCategory.VIDEO
            ? IngredientCategory.VIDEO
            : IngredientCategory.IMAGE,
        status: 'saved',
      };
    }

    let createdAssetId: string | undefined;
    try {
      const { ingredientData } = await this.shared.createMediaDocumentsInternal(
        {
          brandId: input.brandId,
          category,
          extension: category === IngredientCategory.VIDEO ? 'mp4' : 'jpg',
          label: remixTruncate(input.source.snapshot.title, 96),
          organizationId: input.organizationId,
          scope: AssetScope.USER,
          sourceActionId,
          status: IngredientStatus.PROCESSING,
          userId: input.userId,
        },
      );
      createdAssetId = ingredientData.id;
      await this.files.uploadToS3(
        ingredientData.id,
        categoryToPlural(category),
        { type: FileInputType.URL, url },
      );
      const updated = await this.prisma.ingredient.updateMany({
        where: scopedWhere(input.organizationId, {
          brandId: input.brandId,
          id: ingredientData.id,
          status: IngredientStatus.PROCESSING,
        }),
        data: { status: IngredientStatus.UPLOADED },
      });
      if (updated.count !== 1) {
        throw new Error('Source ingredient is no longer available');
      }
      return {
        assetId: ingredientData.id,
        category,
        status: 'saved',
      };
    } catch (error: unknown) {
      if (createdAssetId) {
        try {
          await this.prisma.ingredient.updateMany({
            where: scopedWhere(input.organizationId, {
              brandId: input.brandId,
              id: createdAssetId,
              status: IngredientStatus.PROCESSING,
            }),
            data: { status: IngredientStatus.FAILED },
          });
        } catch (cleanupError: unknown) {
          this.logger.error(
            'Remix source failure status could not be persisted',
            cleanupError,
          );
        }
      }
      this.logger.error('Remix source media could not be persisted', error, {
        brandId: input.brandId,
        organizationId: input.organizationId,
        sourceId: input.source.snapshot.sourceId,
      });
      return { status: 'unavailable', reason: 'copy_failed' };
    }
  }

  private async resolveOwnedAsset(
    input: RemixSourceMediaIngestInput,
  ): Promise<RemixSourceMediaIngestResult> {
    const existingAssetId = input.source.sourceMedia?.existingAssetIds[0];
    if (
      !existingAssetId ||
      input.source.snapshot.selector.kind !== 'owned_post'
    ) {
      return { status: 'unavailable', reason: 'invalid_asset' };
    }
    const existing = await this.prisma.ingredient.findFirst({
      select: { category: true, id: true },
      where: scopedWhere(input.organizationId, {
        brandId: input.brandId,
        id: existingAssetId,
        status: {
          in: [...GENERATION_READY_STATUSES] as IngredientStatus[],
        },
      }),
    });
    if (
      existing &&
      (existing.category === IngredientCategory.IMAGE ||
        existing.category === IngredientCategory.VIDEO ||
        existing.category === IngredientCategory.AVATAR)
    ) {
      return {
        assetId: existing.id,
        category:
          existing.category === IngredientCategory.VIDEO ||
          existing.category === IngredientCategory.AVATAR
            ? IngredientCategory.VIDEO
            : IngredientCategory.IMAGE,
        status: 'saved',
      };
    }
    return { status: 'unavailable', reason: 'invalid_asset' };
  }

  private sourceActionId(input: RemixSourceMediaIngestInput): string {
    return `remix-source:${input.brandId}:${input.source.snapshot.selector.kind}:${input.source.snapshot.sourceId}`;
  }

  private findReadySource(
    input: RemixSourceMediaIngestInput,
    sourceActionId: string,
  ) {
    return this.prisma.ingredient.findFirst({
      select: { category: true, id: true },
      where: scopedWhere(input.organizationId, {
        brandId: input.brandId,
        sourceActionId,
        category: { in: [IngredientCategory.IMAGE, IngredientCategory.VIDEO] },
        status: {
          in: [...GENERATION_READY_STATUSES] as IngredientStatus[],
        },
      }),
    });
  }
}
