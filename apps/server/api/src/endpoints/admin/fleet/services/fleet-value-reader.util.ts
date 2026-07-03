import type { IngredientDocument } from '@api/collections/ingredients/schemas/ingredient.schema';
import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import type { PersonaDocument } from '@api/collections/personas/schemas/persona.schema';
import type {
  AdminFleetGenerationJob,
  AdminFleetGenerationJobStatus,
} from '@api/endpoints/admin/fleet/interfaces/fleet-generation-job.interface';
import type { AdminFleetSourceRecord } from '@api/endpoints/admin/fleet/interfaces/fleet-ingest.interface';
import {
  ContentIntelligencePlatform,
  DarkroomReviewStatus as DarkroomReviewStatusEnum,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';

/**
 * Pure value-coercion and mapping helpers for the fleet domain.
 * Extracted verbatim from the former AdminFleetService god object so the
 * collaborator services can share a single typed reader without re-deriving
 * the loose-input parsing rules.
 */
export const AdminFleetValueReader = {
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

    const record = AdminFleetValueReader.readObjectRecord(value);
    const nestedId =
      AdminFleetValueReader.readString(record?.id) ??
      AdminFleetValueReader.readString(record?.id) ??
      AdminFleetValueReader.readString(record?.mongoId);

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
    switch (AdminFleetValueReader.readString(value)) {
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

  getEnabledFleetSources(persona: PersonaDocument): AdminFleetSourceRecord[] {
    const sources = Array.isArray(persona.darkroomSources)
      ? persona.darkroomSources
      : [];

    return sources.flatMap((source) => {
      const record = AdminFleetValueReader.readObjectRecord(source);
      const handle = AdminFleetValueReader.readString(record?.handle);
      const platform = AdminFleetValueReader.readPlatform(record?.platform);

      if (!record || record.enabled !== true || !handle || !platform) {
        return [];
      }

      return [record as AdminFleetSourceRecord];
    });
  },

  hasIngredientCategory(value: unknown, expected: IngredientCategory): boolean {
    return AdminFleetValueReader.readString(value) === expected;
  },

  hasIngredientStatus(value: unknown, expected: IngredientStatus): boolean {
    return AdminFleetValueReader.readString(value) === expected;
  },

  hasReviewStatus(value: unknown, expected: DarkroomReviewStatusEnum): boolean {
    return AdminFleetValueReader.readString(value) === expected;
  },

  getDefaultFleetModerationState(): Pick<
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
      AdminFleetValueReader.hasIngredientCategory(
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
  ): AdminFleetGenerationJobStatus {
    if (
      AdminFleetValueReader.hasIngredientStatus(status, IngredientStatus.FAILED)
    ) {
      return 'failed';
    }
    if (
      AdminFleetValueReader.hasIngredientStatus(
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
    status: AdminFleetGenerationJobStatus | undefined,
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
  ): AdminFleetGenerationJob {
    const stage = ingredient.generationStage ?? 'queued';
    const status = AdminFleetValueReader.deriveGenerationJobState(
      ingredient.status,
      stage,
    );

    return {
      cdnUrl: ingredient.cdnUrl ?? undefined,
      createdAt:
        ingredient.createdAt?.toISOString() ?? new Date().toISOString(),
      error: ingredient.generationError ?? undefined,
      ingredientId: ingredient.id.toString(),
      jobId: ingredient.id.toString(),
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
