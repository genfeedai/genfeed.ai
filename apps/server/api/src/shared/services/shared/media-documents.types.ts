import type { PrismaIngredientCategoryValue } from '@api/helpers/utils/category-prisma/category-prisma.util';
import type {
  AssetScope,
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
  TransformationCategory,
} from '@genfeedai/contracts';
import type {
  GenerationHarnessReceipt,
  IVideoMergeSettings,
} from '@genfeedai/contracts/interfaces';

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
  generationHarness?: GenerationHarnessReceipt;
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
  mergeSettings?: IVideoMergeSettings;
  model?: string;
  negativePrompt?: string;
  order?: number;
  /**
   * Where this asset came from. Every creation path names it, and it is
   * permanent once written.
   */
  origin: IngredientOrigin;
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
  workflowExecutionId?: string;
}

export interface InternalMediaDocumentsInput extends MediaDocumentsInput {
  brandId: string;
  organizationId: string;
  userId: string;
}
