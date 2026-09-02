import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipResultsService } from '@api/collections/clip-results/clip-results.service';
import type { ClipResultDocument } from '@api/collections/clip-results/schemas/clip-result.schema';
import type { CreateIngredientDto } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { scopedWhere } from '@api/index';
import {
  CaptionFormat,
  CaptionLanguage,
  IngredientCategory,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import {
  type ClipLibraryLinkStatus,
  clipResultGenerationSource,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface ClipLibraryLinkInput {
  clipResultId: string;
  organizationId: string;
}

export interface ClipLibraryLinkResult {
  clipResultId: string;
  error?: string;
  ingredientId?: string;
  status: ClipLibraryLinkStatus;
}

interface ClipMediaIdentity {
  cdnUrl?: string;
  s3Key?: string;
}

interface CreatedLibraryAsset {
  ingredientId: string;
  metadataId: string;
}

@Injectable()
export class ClipLibraryLinkService {
  private readonly logContext = 'ClipLibraryLinkService';

  constructor(
    private readonly captionsService: CaptionsService,
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipResultsService: ClipResultsService,
    private readonly ingredientsService: IngredientsService,
    private readonly logger: LoggerService,
    private readonly metadataService: MetadataService,
  ) {}

  async linkReadyClip(
    input: ClipLibraryLinkInput,
  ): Promise<ClipLibraryLinkResult> {
    const clipResult = await this.clipResultsService.findOne(
      scopedWhere(input.organizationId, { id: input.clipResultId }),
    );

    if (!clipResult) {
      return {
        clipResultId: input.clipResultId,
        error: 'Clip result was not found in this organization.',
        status: 'failed',
      };
    }

    if (this.readString(clipResult.status) !== 'completed') {
      return {
        clipResultId: input.clipResultId,
        error: 'Clip result is not ready for Library linking.',
        status: 'failed',
      };
    }

    try {
      await this.clipResultsService.markLibraryLinkState({
        clipResultId: input.clipResultId,
        organizationId: input.organizationId,
        status: 'pending',
      });

      const existing = await this.resolveExistingAsset(
        clipResult,
        input.organizationId,
      );
      if (existing) {
        return existing;
      }

      return await this.createAndClaimAsset(clipResult, input.organizationId);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Library linking failed.';
      this.logger.error(`${this.logContext} failed to link clip result`, {
        clipResultId: input.clipResultId,
        error: message,
        organizationId: input.organizationId,
      });
      await this.clipResultsService.markLibraryLinkState({
        clipResultId: input.clipResultId,
        error: message,
        organizationId: input.organizationId,
        status: 'failed',
      });
      return {
        clipResultId: input.clipResultId,
        error: message,
        status: 'failed',
      };
    }
  }

  private async resolveExistingAsset(
    clipResult: ClipResultDocument,
    organizationId: string,
  ): Promise<ClipLibraryLinkResult | undefined> {
    const linkedIngredientId = this.readString(clipResult.ingredientId);
    if (linkedIngredientId) {
      const linked = await this.ingredientsService.findOne(
        scopedWhere(organizationId, { id: linkedIngredientId }),
      );
      if (this.isUsableLibraryAsset(linked)) {
        await this.clipResultsService.claimLibraryIngredient({
          clipResultId: String(clipResult.id),
          ingredientId: linkedIngredientId,
          organizationId,
        });
        return {
          clipResultId: String(clipResult.id),
          ingredientId: linkedIngredientId,
          status: 'linked',
        };
      }
    }

    const existing = await this.ingredientsService.findOne({
      generationSource: clipResultGenerationSource(String(clipResult.id)),
      isDeleted: false,
      organizationId,
    });
    if (!this.isUsableLibraryAsset(existing)) {
      return undefined;
    }

    const existingId = String(existing.id);
    await this.claimOrAdopt({
      clipResult,
      created: undefined,
      ingredientId: existingId,
      organizationId,
    });
    return {
      clipResultId: String(clipResult.id),
      ingredientId: existingId,
      status: 'linked',
    };
  }

  private async createAndClaimAsset(
    clipResult: ClipResultDocument,
    organizationId: string,
  ): Promise<ClipLibraryLinkResult> {
    const media = this.readMedia(clipResult);
    if (!media.cdnUrl && !media.s3Key) {
      throw new Error('Clip result has no reusable media identity.');
    }

    const created = await this.createLibraryAsset(
      clipResult,
      organizationId,
      media,
    );
    const claimedId = await this.claimOrAdopt({
      clipResult,
      created,
      ingredientId: created.ingredientId,
      organizationId,
    });

    if (claimedId === created.ingredientId) {
      await this.createTranscriptSidecar(
        clipResult,
        organizationId,
        created.ingredientId,
      );
    }

    return {
      clipResultId: String(clipResult.id),
      ingredientId: claimedId,
      status: 'linked',
    };
  }

  private async createLibraryAsset(
    clipResult: ClipResultDocument,
    organizationId: string,
    media: ClipMediaIdentity,
  ): Promise<CreatedLibraryAsset> {
    const projectId = this.readString(clipResult.projectId);
    const title = this.readString(clipResult.title) ?? 'Clip';
    const summary = this.readString(clipResult.summary);
    const project = projectId
      ? await this.clipProjectsService.findOne(
          scopedWhere(organizationId, { id: projectId }),
        )
      : null;
    const brandId = this.readString(project?.brandId);
    const userId = this.readString(clipResult.userId);
    const metadata = await this.metadataService.create({
      ...(summary ? { description: summary } : {}),
      ...(typeof clipResult.duration === 'number'
        ? { duration: clipResult.duration }
        : {}),
      extension: MetadataExtension.MP4,
      externalId: String(clipResult.id),
      externalProvider: 'clip-result',
      hasAudio: true,
      label: title,
      ...(media.cdnUrl ? { result: media.cdnUrl } : {}),
    });

    try {
      const ingredient = await this.ingredientsService.create({
        ...(brandId ? { brandId } : {}),
        category: IngredientCategory.VIDEO,
        cdnUrl: media.cdnUrl,
        generationCompletedAt: new Date(),
        generationPrompt: title,
        generationSource: clipResultGenerationSource(String(clipResult.id)),
        generationStage: this.readString(clipResult.mode) ?? 'avatar',
        metadataId: metadata.id,
        mimeType: 'video/mp4',
        ...(this.readString(clipResult.providerName)
          ? { modelUsed: this.readString(clipResult.providerName) }
          : {}),
        organizationId,
        s3Key: media.s3Key,
        status: IngredientStatus.GENERATED,
        ...(userId ? { userId } : {}),
        ...(projectId ? { workflowUsed: `clip-project:${projectId}` } : {}),
      } as CreateIngredientDto);

      return {
        ingredientId: String(ingredient.id),
        metadataId: metadata.id,
      };
    } catch (error: unknown) {
      await this.metadataService
        .patch(metadata.id, { isDeleted: true })
        .catch(() => undefined);
      throw error;
    }
  }

  private async claimOrAdopt(input: {
    clipResult: ClipResultDocument;
    created?: CreatedLibraryAsset;
    ingredientId: string;
    organizationId: string;
  }): Promise<string> {
    const claimed = await this.clipResultsService.claimLibraryIngredient({
      clipResultId: String(input.clipResult.id),
      ingredientId: input.ingredientId,
      organizationId: input.organizationId,
    });
    if (claimed) {
      return input.ingredientId;
    }

    const winner = await this.clipResultsService.findOne(
      scopedWhere(input.organizationId, { id: String(input.clipResult.id) }),
    );
    const winnerId = this.readString(winner?.ingredientId);
    if (winnerId && winnerId !== input.ingredientId && input.created) {
      await Promise.allSettled([
        this.ingredientsService.patch(input.created.ingredientId, {
          isDeleted: true,
        }),
        this.metadataService.patch(input.created.metadataId, {
          isDeleted: true,
        }),
      ]);
      return winnerId;
    }

    if (winnerId) {
      return winnerId;
    }

    throw new Error('Another worker claimed the Library link.');
  }

  private async createTranscriptSidecar(
    clipResult: ClipResultDocument,
    _organizationId: string,
    ingredientId: string,
  ): Promise<void> {
    const captionSrt = this.readString(clipResult.captionSrt);
    const userId = this.readString(clipResult.userId);
    if (!captionSrt || !userId) {
      return;
    }

    const caption = await this.captionsService.create({
      format: CaptionFormat.SRT,
      ingredientId,
      language: CaptionLanguage.EN,
    });
    const captionId = this.readString(caption?.id);
    if (captionId) {
      await this.captionsService.patch(captionId, { content: captionSrt });
    }
  }

  private isUsableLibraryAsset(ingredient: unknown): ingredient is {
    id: string;
  } {
    if (!ingredient || typeof ingredient !== 'object') {
      return false;
    }

    const record = ingredient as Record<string, unknown>;
    if (record.isDeleted === true) {
      return false;
    }

    const ingredientId = this.readString(record.id);
    const organizationId = this.readString(record.organizationId);
    if (!ingredientId || !organizationId) {
      return false;
    }

    return Boolean(
      this.readString(record.s3Key) || this.readString(record.cdnUrl),
    );
  }

  private readMedia(clipResult: ClipResultDocument): ClipMediaIdentity {
    return {
      cdnUrl:
        this.readString(clipResult.captionedVideoUrl) ??
        this.readString(clipResult.videoUrl),
      s3Key:
        this.readString(clipResult.captionedVideoS3Key) ??
        this.readString(clipResult.videoS3Key),
    };
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
