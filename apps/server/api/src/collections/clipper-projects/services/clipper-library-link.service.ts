import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { ClipperResultsService } from '@api/collections/clipper-results/clipper-results.service';
import type { ClipperResultDocument } from '@api/collections/clipper-results/schemas/clipper-result.schema';
import type { IngredientServerCreate } from '@api/collections/ingredients/dto/create-ingredient.dto';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { MetadataService } from '@api/collections/metadata/services/metadata.service';
import { scopedWhere } from '@api/index';
import {
  CaptionFormat,
  CaptionLanguage,
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  MetadataExtension,
} from '@genfeedai/contracts';
import {
  type ClipperLibraryLinkStatus,
  clipperResultGenerationSource,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface ClipperLibraryLinkInput {
  clipperResultId: string;
  organizationId: string;
}

export interface ClipperLibraryLinkResult {
  clipperResultId: string;
  error?: string;
  ingredientId?: string;
  status: ClipperLibraryLinkStatus;
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
export class ClipperLibraryLinkService {
  private readonly logContext = 'ClipperLibraryLinkService';

  constructor(
    private readonly captionsService: CaptionsService,
    private readonly clipperProjectsService: ClipperProjectsService,
    private readonly clipperResultsService: ClipperResultsService,
    private readonly ingredientsService: IngredientsService,
    private readonly logger: LoggerService,
    private readonly metadataService: MetadataService,
  ) {}

  async linkReadyClip(
    input: ClipperLibraryLinkInput,
  ): Promise<ClipperLibraryLinkResult> {
    const clipperResult = await this.clipperResultsService.findOne(
      scopedWhere(input.organizationId, { id: input.clipperResultId }),
    );

    if (!clipperResult) {
      return {
        clipperResultId: input.clipperResultId,
        error: 'Clip result was not found in this organization.',
        status: 'failed',
      };
    }

    if (this.readString(clipperResult.status) !== 'completed') {
      return {
        clipperResultId: input.clipperResultId,
        error: 'Clip result is not ready for Library linking.',
        status: 'failed',
      };
    }

    try {
      await this.clipperResultsService.markLibraryLinkState({
        clipperResultId: input.clipperResultId,
        organizationId: input.organizationId,
        status: 'pending',
      });

      const existing = await this.resolveExistingAsset(
        clipperResult,
        input.organizationId,
      );
      if (existing) {
        return existing;
      }

      return await this.createAndClaimAsset(
        clipperResult,
        input.organizationId,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Library linking failed.';
      this.logger.error(`${this.logContext} failed to link clip result`, {
        clipperResultId: input.clipperResultId,
        error: message,
        organizationId: input.organizationId,
      });
      await this.clipperResultsService.markLibraryLinkState({
        clipperResultId: input.clipperResultId,
        error: message,
        organizationId: input.organizationId,
        status: 'failed',
      });
      return {
        clipperResultId: input.clipperResultId,
        error: message,
        status: 'failed',
      };
    }
  }

  private async resolveExistingAsset(
    clipperResult: ClipperResultDocument,
    organizationId: string,
  ): Promise<ClipperLibraryLinkResult | undefined> {
    const linkedIngredientId = this.readString(clipperResult.ingredientId);
    if (linkedIngredientId) {
      const linked = await this.ingredientsService.findOne(
        scopedWhere(organizationId, { id: linkedIngredientId }),
      );
      if (this.isUsableLibraryAsset(linked)) {
        await this.clipperResultsService.claimLibraryIngredient({
          clipperResultId: String(clipperResult.id),
          ingredientId: linkedIngredientId,
          organizationId,
        });
        return {
          clipperResultId: String(clipperResult.id),
          ingredientId: linkedIngredientId,
          status: 'linked',
        };
      }
    }

    const existing = await this.ingredientsService.findOne({
      generationSource: clipperResultGenerationSource(String(clipperResult.id)),
      isDeleted: false,
      organizationId,
    });
    if (!this.isUsableLibraryAsset(existing)) {
      return undefined;
    }

    const existingId = String(existing.id);
    await this.claimOrAdopt({
      clipperResult,
      created: undefined,
      ingredientId: existingId,
      organizationId,
    });
    return {
      clipperResultId: String(clipperResult.id),
      ingredientId: existingId,
      status: 'linked',
    };
  }

  private async createAndClaimAsset(
    clipperResult: ClipperResultDocument,
    organizationId: string,
  ): Promise<ClipperLibraryLinkResult> {
    const media = this.readMedia(clipperResult);
    if (!media.cdnUrl && !media.s3Key) {
      throw new Error('Clip result has no reusable media identity.');
    }

    const created = await this.createLibraryAsset(
      clipperResult,
      organizationId,
      media,
    );
    const claimedId = await this.claimOrAdopt({
      clipperResult,
      created,
      ingredientId: created.ingredientId,
      organizationId,
    });

    if (claimedId === created.ingredientId) {
      await this.createTranscriptSidecar(
        clipperResult,
        organizationId,
        created.ingredientId,
      );
    }

    return {
      clipperResultId: String(clipperResult.id),
      ingredientId: claimedId,
      status: 'linked',
    };
  }

  private async createLibraryAsset(
    clipperResult: ClipperResultDocument,
    organizationId: string,
    media: ClipMediaIdentity,
  ): Promise<CreatedLibraryAsset> {
    const projectId = this.readString(clipperResult.projectId);
    const title = this.readString(clipperResult.title) ?? 'Clip';
    const summary = this.readString(clipperResult.summary);
    const project = projectId
      ? await this.clipperProjectsService.findOne(
          scopedWhere(organizationId, { id: projectId }),
        )
      : null;
    const brandId = this.readString(project?.brandId);
    const userId = this.readString(clipperResult.userId);
    const metadata = await this.metadataService.create({
      ...(summary ? { description: summary } : {}),
      ...(typeof clipperResult.duration === 'number'
        ? { duration: clipperResult.duration }
        : {}),
      extension: MetadataExtension.MP4,
      externalId: String(clipperResult.id),
      externalProvider: 'clipper-result',
      hasAudio: true,
      label: title,
      ...(media.cdnUrl ? { result: media.cdnUrl } : {}),
    });

    try {
      const ingredient = await this.ingredientsService.create({
        ...(brandId ? { brandId } : {}),
        category: IngredientCategory.VIDEO,
        generationCompletedAt: new Date(),
        ...(clipperResult.generationProvider
          ? { generationProvider: clipperResult.generationProvider }
          : {}),
        generationPrompt: title,
        generationSource: clipperResultGenerationSource(
          String(clipperResult.id),
        ),
        generationStage: this.readString(clipperResult.mode) ?? 'avatar',
        metadataId: metadata.id,
        mimeType: 'video/mp4',
        origin: IngredientOrigin.GENERATED,
        ...(this.readString(clipperResult.providerName)
          ? { modelUsed: this.readString(clipperResult.providerName) }
          : {}),
        organizationId,
        s3Key: media.s3Key,
        status: IngredientStatus.GENERATED,
        ...(userId ? { userId } : {}),
        ...(projectId ? { workflowUsed: `clipper-project:${projectId}` } : {}),
      } as IngredientServerCreate);

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
    clipperResult: ClipperResultDocument;
    created?: CreatedLibraryAsset;
    ingredientId: string;
    organizationId: string;
  }): Promise<string> {
    const claimed = await this.clipperResultsService.claimLibraryIngredient({
      clipperResultId: String(input.clipperResult.id),
      ingredientId: input.ingredientId,
      organizationId: input.organizationId,
    });
    if (claimed) {
      return input.ingredientId;
    }

    const winner = await this.clipperResultsService.findOne(
      scopedWhere(input.organizationId, { id: String(input.clipperResult.id) }),
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
    clipperResult: ClipperResultDocument,
    organizationId: string,
    ingredientId: string,
  ): Promise<void> {
    const captionSrt = this.readString(clipperResult.captionSrt);
    const userId = this.readString(clipperResult.userId);
    if (!captionSrt || !userId) {
      return;
    }

    const captionInput = {
      format: CaptionFormat.SRT,
      ingredientId,
      isDeleted: false,
      language: CaptionLanguage.EN,
      organizationId,
      userId,
    };
    const caption = await this.captionsService.create(captionInput);
    const captionId = this.readString(caption?.id);
    if (captionId) {
      await this.captionsService.patchOneWhere(
        scopedWhere(organizationId, { id: captionId }),
        { content: captionSrt },
      );
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

  private readMedia(clipperResult: ClipperResultDocument): ClipMediaIdentity {
    return {
      cdnUrl:
        this.readString(clipperResult.captionedVideoUrl) ??
        this.readString(clipperResult.videoUrl),
      s3Key:
        this.readString(clipperResult.captionedVideoS3Key) ??
        this.readString(clipperResult.videoS3Key),
    };
  }

  private readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
