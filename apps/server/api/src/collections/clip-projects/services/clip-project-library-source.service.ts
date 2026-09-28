import { createHash } from 'node:crypto';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import type { CreateClipProjectFromIngredientDto } from '@api/collections/clip-projects/dto/create-clip-project-from-ingredient.dto';
import { MAX_CLIP_SOURCE_SIZE_BYTES } from '@api/collections/clip-projects/dto/prepare-clip-upload.dto';
import { ClipAnalysisWorkflowQueueService } from '@api/collections/clip-projects/services/clip-analysis-workflow-queue.service';
import { ClipIdentityResolutionService } from '@api/collections/clip-projects/services/clip-identity-resolution.service';
import type { ClipProjectAnalysisResult } from '@api/collections/clip-projects/services/clip-project-ingestion.service';
import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import {
  CLIP_SOURCE_MAX_DURATION_SECONDS,
  CLIP_SOURCE_MIN_DURATION_SECONDS,
} from '@genfeedai/contracts/constants';
import {
  CLIP_SOURCE_SCHEMA_VERSION,
  type ClipSourceContract,
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

interface LibraryClipSourceMedia {
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
export class ClipProjectLibrarySourceService {
  constructor(
    private readonly clipProjectsService: ClipProjectsService,
    private readonly clipAnalysisWorkflowQueue: ClipAnalysisWorkflowQueueService,
    private readonly clipIdentityResolutionService: ClipIdentityResolutionService,
    private readonly ingredientsService: IngredientsService,
    private readonly configService: ConfigService,
  ) {}

  async createFromIngredient(
    user: User,
    dto: CreateClipProjectFromIngredientDto,
  ): Promise<ClipProjectAnalysisResult> {
    const orgId = user.organizationId;
    const userId = user.userId ?? user.id;
    const brandId = dto.brandId ?? user.brandId;
    const identity = await this.clipIdentityResolutionService.resolve({
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
    const source: ClipSourceContract = {
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
      schemaVersion: CLIP_SOURCE_SCHEMA_VERSION,
      ...(media.sizeBytes > 0 ? { sizeBytes: media.sizeBytes } : {}),
      status: 'queued',
      updatedAt: new Date().toISOString(),
    };

    const project = await this.clipProjectsService.create({
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
    const queuedSource = this.withJobId(source, `clip-analysis-${projectId}`);
    await this.clipProjectsService.patch(
      projectId,
      { source: queuedSource },
      [],
      orgId,
    );

    await this.clipAnalysisWorkflowQueue.enqueue({
      language,
      maxClips,
      minViralityScore,
      orgId,
      projectId,
      source: queuedSource,
      userId,
      youtubeUrl: media.mediaUrl,
    });

    return { identity, projectId, status: 'analyzing' };
  }

  private assertEligibleLibrarySource(
    ingredient: IngredientDocument,
  ): LibraryClipSourceMedia {
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
    if (durationSeconds < CLIP_SOURCE_MIN_DURATION_SECONDS) {
      throw new BadRequestException(
        `Clip sources must be at least ${CLIP_SOURCE_MIN_DURATION_SECONDS} seconds long.`,
      );
    }
    if (durationSeconds > CLIP_SOURCE_MAX_DURATION_SECONDS) {
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
    source: ClipSourceContract,
    jobId: string,
  ): ClipSourceContract {
    return { ...source, jobId, updatedAt: new Date().toISOString() };
  }

  private hashSource(value: string): string {
    return `sha256:${createHash('sha256').update(value).digest('hex')}`;
  }
}
