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
  | { status: 'unavailable' };

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
    const existingAssetId = input.source.sourceMedia?.existingAssetIds[0];
    if (existingAssetId) {
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
      if (existing) {
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
    }

    const videoUrl = remixMediaUrl(input.source.sourceMedia?.videoUrls[0]);
    const imageUrl = remixMediaUrl(input.source.sourceMedia?.imageUrls[0]);
    const url = videoUrl ?? imageUrl;
    if (!url) {
      return { status: 'skipped' };
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
          status: IngredientStatus.UPLOADED,
          userId: input.userId,
        },
      );
      await this.files.uploadToS3(
        ingredientData.id,
        categoryToPlural(category),
        { type: FileInputType.URL, url },
      );
      return {
        assetId: ingredientData.id,
        category,
        status: 'saved',
      };
    } catch (error: unknown) {
      this.logger.error('Remix source media could not be persisted', error, {
        brandId: input.brandId,
        organizationId: input.organizationId,
        sourceId: input.source.snapshot.sourceId,
      });
      return { status: 'unavailable' };
    }
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
        status: {
          in: [...GENERATION_READY_STATUSES] as IngredientStatus[],
        },
      }),
    });
  }
}
