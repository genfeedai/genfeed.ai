import { createHash } from 'node:crypto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import type { CreateClipperProjectFromIngredientDto } from '@api/collections/clipper-projects/dto/create-clipper-project-from-ingredient.dto';
import { MAX_CLIP_SOURCE_SIZE_BYTES } from '@api/collections/clipper-projects/dto/prepare-clipper-upload.dto';
import { ClipperAnalysisWorkflowQueueService } from '@api/collections/clipper-projects/services/clipper-analysis-workflow-queue.service';
import { ClipperIdentityResolutionService } from '@api/collections/clipper-projects/services/clipper-identity-resolution.service';
import type { ClipperProjectAnalysisResult } from '@api/collections/clipper-projects/services/clipper-project-ingestion.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import {
  CLIPPER_SOURCE_MAX_DURATION_SECONDS,
  CLIPPER_SOURCE_MIN_DURATION_SECONDS,
} from '@genfeedai/contracts/constants';
import {
  CLIPPER_SOURCE_SCHEMA_VERSION,
  type ClipperSourceContract,
  DEFAULT_CLIP_RESULT_MODE,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { resolveIngredientMediaUrl } from '@libs/media/media-url.util';
import { BadRequestException, Injectable } from '@nestjs/common';

const DEFAULT_CLIP_SOURCE_MAX_RETRIES = 3;

/** Library statuses whose media is present and final. */
const READY_LIBRARY_SOURCE_STATUSES: ReadonlySet<string> = new Set([
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
]);

interface LibraryClipperSourceMedia {
  contentType: string;
  durationSeconds: number;
  mediaUrl: string;
  sizeBytes: number;
  storageKey?: string;
}

/**
 * Starts a Clips project from a Library video ("Make clips"): checks the
 * asset against the caller's organization and brand and the Clips source
 * limits, then queues highlight analysis.
 */
@Injectable()
export class ClipperProjectLibrarySourceService {
  constructor(
    private readonly clipperProjectsService: ClipperProjectsService,
    private readonly clipperAnalysisWorkflowQueue: ClipperAnalysisWorkflowQueueService,
    private readonly clipperIdentityResolutionService: ClipperIdentityResolutionService,
    private readonly ingredientsService: IngredientsService,
    private readonly configService: ConfigService,
  ) {}

  async createFromIngredient(
    user: User,
    dto: CreateClipperProjectFromIngredientDto,
  ): Promise<ClipperProjectAnalysisResult> {
    const orgId = user.organizationId;
    const userId = user.userId ?? user.id;
    const brandId = dto.brandId ?? user.brandId;
    const identity = await this.clipperIdentityResolutionService.resolve({
      brandId,
      organizationId: orgId,
    });

    const ingredient = await this.ingredientsService.findOne(
      {
        id: dto.ingredientId,
        isDeleted: false,
        organizationId: orgId,
      },
      [{ path: 'metadata' }],
    );
    // Same visibility rule as the Library: an org-shared asset (no brand) is
    // usable from any brand, a branded asset only from its own brand.
    if (!ingredient || (ingredient.brandId && ingredient.brandId !== brandId)) {
      throw new NotFoundException('Ingredient', dto.ingredientId);
    }

    const media = this.assertEligibleLibrarySource(ingredient);
    const language = dto.language ?? 'en';
    const maxClips = dto.maxClips ?? 10;
    const minViralityScore = dto.minViralityScore ?? 50;
    const source: ClipperSourceContract = {
      artifact: {
        contentType: media.contentType,
        durationSeconds: media.durationSeconds,
        mediaUrl: media.mediaUrl,
        storageKey: media.storageKey,
      },
      contentType: media.contentType,
      durationSeconds: media.durationSeconds,
      fingerprint: this.hashSource(`library:${ingredient.id}`),
      flow: 'review',
      ingredientId: ingredient.id,
      kind: 'library',
      maxRetries: DEFAULT_CLIP_SOURCE_MAX_RETRIES,
      retryCount: 0,
      schemaVersion: CLIPPER_SOURCE_SCHEMA_VERSION,
      ...(media.sizeBytes > 0 ? { sizeBytes: media.sizeBytes } : {}),
      status: 'queued',
      updatedAt: new Date().toISOString(),
    };

    const project = await this.clipperProjectsService.create({
      brandId,
      language,
      name:
        dto.name ??
        this.readMetadataLabel(ingredient) ??
        `Library Clip Source — ${new Date().toISOString().slice(0, 10)}`,
      organizationId: orgId,
      settings: {
        addCaptions: true,
        aspectRatio: '9:16',
        captionStyle: 'default',
        flow: 'review',
        language,
        maxClips,
        maxDuration: 90,
        minDuration: 15,
        minViralityScore,
        mode: DEFAULT_CLIP_RESULT_MODE,
      },
      source,
      sourceVideoS3Key: media.storageKey,
      sourceVideoUrl: media.mediaUrl,
      status: 'pending',
      userId,
    });

    const projectId = String(project.id);
    const queuedSource = this.withJobId(
      source,
      `clipper-analysis-${projectId}`,
    );
    await this.clipperProjectsService.patch(
      projectId,
      { source: queuedSource },
      [],
      orgId,
    );

    try {
      await this.clipperAnalysisWorkflowQueue.enqueue({
        language,
        maxClips,
        minViralityScore,
        orgId,
        projectId,
        source: queuedSource,
        userId,
        youtubeUrl: media.mediaUrl,
      });
    } catch (error: unknown) {
      await this.clipperProjectsService.markSourceDispatchFailed(
        projectId,
        orgId,
        queuedSource,
      );
      throw error;
    }

    return { identity, projectId, status: 'analyzing' };
  }

  private assertEligibleLibrarySource(
    ingredient: IngredientDocument,
  ): LibraryClipperSourceMedia {
    const contentType = ingredient.mimeType ?? 'video/mp4';
    if (
      String(ingredient.category) !== IngredientCategory.VIDEO ||
      !contentType.startsWith('video/')
    ) {
      throw new BadRequestException(
        'Only video assets can be made into clips.',
      );
    }
    if (!READY_LIBRARY_SOURCE_STATUSES.has(String(ingredient.status))) {
      throw new BadRequestException(
        'This video is not ready yet. Make clips once it has finished processing.',
      );
    }

    const durationSeconds = ingredient.metadata?.duration;
    if (
      typeof durationSeconds !== 'number' ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0
    ) {
      throw new BadRequestException('This video has no known duration.');
    }
    if (durationSeconds < CLIPPER_SOURCE_MIN_DURATION_SECONDS) {
      throw new BadRequestException(
        `Clip sources must be at least ${CLIPPER_SOURCE_MIN_DURATION_SECONDS} seconds long.`,
      );
    }
    if (durationSeconds > CLIPPER_SOURCE_MAX_DURATION_SECONDS) {
      throw new BadRequestException('Clip sources may be up to 6 hours long.');
    }

    const sizeBytes = ingredient.metadata?.size ?? 0;
    if (sizeBytes > MAX_CLIP_SOURCE_SIZE_BYTES) {
      throw new BadRequestException('Clip sources may be up to 10 GB.');
    }

    const mediaUrl = resolveIngredientMediaUrl(
      ingredient,
      this.configService.cdnUrl,
    );
    if (!mediaUrl) {
      throw new BadRequestException('This video has no stored media.');
    }

    return {
      contentType,
      durationSeconds,
      mediaUrl,
      sizeBytes,
      storageKey: ingredient.s3Key ?? undefined,
    };
  }

  private readMetadataLabel(
    ingredient: IngredientDocument,
  ): string | undefined {
    const label = ingredient.metadata?.label;
    return typeof label === 'string' && label.trim().length > 0
      ? label
      : undefined;
  }

  private withJobId(
    source: ClipperSourceContract,
    jobId: string,
  ): ClipperSourceContract {
    return { ...source, jobId, updatedAt: new Date().toISOString() };
  }

  private hashSource(value: string): string {
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
  }
}
