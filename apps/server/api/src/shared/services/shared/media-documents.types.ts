import type { PrismaIngredientCategoryValue } from '@api/helpers/utils/category-prisma/category-prisma.util';
import type {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  TransformationCategory,
} from '@genfeedai/enums';

/**
 * Canonical persistence contract for the Ingredient + Metadata pair backing
 * generated and uploaded media. This is intentionally narrower than provider
 * request DTOs so provider-only options can never leak into Prisma writes.
 */
export interface MediaDocumentsInput {
  assistant?: string;
  bookmarkId?: string;
  brandId?: string | null;
  category: IngredientCategory | PrismaIngredientCategoryValue;
  description?: string;
  duration?: number;
  extension?: string;
  externalId?: string;
  externalProvider?: string;
  generationPrompt?: string;
  generationSeed?: number;
  generationSource?: string;
  groupId?: string;
  groupIndex?: number;
  hasAudio?: boolean;
  height?: number;
  isDefault?: boolean;
  isMergeEnabled?: boolean;
  label?: string;
  language?: string;
  model?: string;
  negativePrompt?: string;
  order?: number;
  organizationId?: string;
  parentId?: string;
  promptId?: string;
  promptTemplate?: string;
  providerData?: Record<string, unknown>;
  resolution?: string;
  result?: string;
  scope?: AssetScope;
  size?: number;
  sourceActionId?: string;
  sourceIds?: string[];
  status?: IngredientStatus;
  style?: string | null;
  tagIds?: string[];
  templateVersion?: number;
  transformations?: TransformationCategory[];
  userId?: string;
  voiceSource?: string;
  width?: number;
}

export interface InternalMediaDocumentsInput extends MediaDocumentsInput {
  brandId: string;
  organizationId: string;
  userId: string;
}
