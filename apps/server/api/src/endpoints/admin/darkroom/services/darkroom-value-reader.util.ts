import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import type {
  DarkroomGenerationJob,
  DarkroomGenerationJobStatus,
} from '@api/endpoints/admin/darkroom/interfaces/darkroom-generation-job.interface';
import type { DarkroomSourceRecord } from '@api/endpoints/admin/darkroom/interfaces/darkroom-ingest.interface';
import {
  ContentIntelligencePlatform,
  DarkroomReviewStatus as DarkroomReviewStatusEnum,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';

/**
 * Pure value-coercion and mapping helpers for the darkroom domain.
 * Extracted verbatim from the former DarkroomService god object so the
 * collaborator services can share a single typed reader without re-deriving
 * the loose-input parsing rules.
 */
export const DarkroomValueReader = {
  readObjectRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : undefined;
  },

  readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
      ? value
      : undefined;
  },

  readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  },

  readReferenceId(value: unknown): string | undefined {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }

    const record = DarkroomValueReader.readObjectRecord(value);
    const nestedId =
      DarkroomValueReader.readString(record?._id) ??
      DarkroomValueReader.readString(record?.id) ??
      DarkroomValueReader.readString(record?.mongoId);

    if (nestedId) {
      return nestedId;
    }

    if (
      value &&
      typeof value === 'object' &&
      'toString' in (value as object) &&
      typeof (value as { toString: () => string }).toString === 'function'
    ) {
      const stringified = (value as { toString: () => string }).toString();
      return stringified !== '[object Object]' ? stringified : undefined;
    }

    return undefined;
  },

  readPlatform(value: unknown): ContentIntelligencePlatform | undefined {
    switch (DarkroomValueReader.readString(value)) {
      case ContentIntelligencePlatform.INSTAGRAM:
        return ContentIntelligencePlatform.INSTAGRAM;
      case ContentIntelligencePlatform.LINKEDIN:
        return ContentIntelligencePlatform.LINKEDIN;
      case ContentIntelligencePlatform.TIKTOK:
        return ContentIntelligencePlatform.TIKTOK;
      case ContentIntelligencePlatform.TWITTER:
        return ContentIntelligencePlatform.TWITTER;
      default:
        return undefined;
    }
  },

  getEnabledDarkroomSources(persona: PersonaDocument): DarkroomSourceRecord[] {
    const sources = Array.isArray(persona.darkroomSources)
      ? persona.darkroomSources
      : [];

    return sources.flatMap((source) => {
      const record = DarkroomValueReader.readObjectRecord(source);
      const handle = DarkroomValueReader.readString(record?.handle);
      const platform = DarkroomValueReader.readPlatform(record?.platform);

      if (!record || record.enabled !== true || !handle || !platform) {
        return [];
      }

      return [record as DarkroomSourceRecord];
    });
  },

  hasIngredientCategory(value: unknown, expected: IngredientCategory): boolean {
    return DarkroomValueReader.readString(value) === expected;
  },

  hasIngredientStatus(value: unknown, expected: IngredientStatus): boolean {
    return DarkroomValueReader.readString(value) === expected;
  },

  hasReviewStatus(value: unknown, expected: DarkroomReviewStatusEnum): boolean {
    return DarkroomValueReader.readString(value) === expected;
  },

  getDefaultDarkroomModerationState(): Pick<
    Parameters<IngredientsService['create']>[0],
    'contentRating' | 'reviewStatus'
  > {
    return {
      contentRating: undefined,
      reviewStatus: DarkroomReviewStatusEnum.PENDING,
    };
  },

  getDimensionsFromAspectRatio(aspectRatio?: string): {
    width?: number;
    height?: number;
  } {
    if (!aspectRatio) {
      return {};
    }

    const [w, h] = aspectRatio.split(':').map(Number);
    if (!(w && h)) {
      return {};
    }

    const scale = 1024 / Math.max(w, h);
    return {
      height: Math.round(h * scale),
      width: Math.round(w * scale),
    };
  },

  getDatasetExtension(
    sourceUrl: string,
    category: string,
  ): 'jpg' | 'png' | 'webp' | 'mp4' {
    const normalizedUrl = sourceUrl.toLowerCase();
    if (normalizedUrl.includes('.png')) {
      return 'png';
    }
    if (normalizedUrl.includes('.webp')) {
      return 'webp';
    }
    if (
      DarkroomValueReader.hasIngredientCategory(
        category,
        IngredientCategory.VIDEO,
      ) ||
      normalizedUrl.includes('.mp4')
    ) {
      return 'mp4';
    }
    return 'jpg';
  },

  /**
   * Derive the generation-job lifecycle state from an ingredient's persisted
   * status + stage. Replaces the former 5-level nested ternary with an
   * explicit precedence ladder: terminal statuses win, then the stage decides.
   */
  deriveGenerationJobState(
    status: unknown,
    stage: string,
  ): DarkroomGenerationJobStatus {
    if (
      DarkroomValueReader.hasIngredientStatus(status, IngredientStatus.FAILED)
    ) {
      return 'failed';
    }
    if (
      DarkroomValueReader.hasIngredientStatus(
        status,
        IngredientStatus.GENERATED,
      )
    ) {
      return 'completed';
    }
    switch (stage) {
      case 'queued':
        return 'queued';
      case 'uploading':
        return 'uploading';
      default:
        return 'processing';
    }
  },

  /**
   * Map a generation-job lifecycle state to the persisted ingredient status.
   * Replaces the former nested ternary in updateGenerationJob.
   */
  ingredientStatusForJobState(
    status: DarkroomGenerationJobStatus | undefined,
  ): IngredientStatus {
    switch (status) {
      case 'failed':
        return IngredientStatus.FAILED;
      case 'completed':
        return IngredientStatus.GENERATED;
      default:
        return IngredientStatus.PROCESSING;
    }
  },

  mapIngredientToGenerationJob(
    ingredient: IngredientDocument,
  ): DarkroomGenerationJob {
    const stage = ingredient.generationStage ?? 'queued';
    const status = DarkroomValueReader.deriveGenerationJobState(
      ingredient.status,
      stage,
    );

    return {
      cdnUrl: ingredient.cdnUrl ?? undefined,
      createdAt:
        ingredient.createdAt?.toISOString() ?? new Date().toISOString(),
      error: ingredient.generationError ?? undefined,
      ingredientId: ingredient._id.toString(),
      jobId: ingredient._id.toString(),
      model: ingredient.modelUsed ?? ingredient.generationSource ?? '',
      personaSlug: ingredient.personaSlug ?? '',
      progress: ingredient.generationProgress ?? 0,
      prompt: ingredient.generationPrompt ?? '',
      stage,
      status,
      updatedAt:
        ingredient.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  },
} as const;
