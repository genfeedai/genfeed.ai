import { BaseEntity } from '@api/entities/base.entity';
import type {
  AssetScope,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/contracts';
import type { PromptRenderTarget } from '@genfeedai/harness';

export class PromptEntity extends BaseEntity {
  declare readonly organizationId: string | null;
  declare readonly brandId: string | null;
  declare readonly userId: string;
  declare readonly ingredientId: string | null;
  declare readonly articleId: string | null;
  declare readonly status: PromptStatus;
  declare readonly original: string;
  declare readonly enhanced: string;
  declare readonly category: PromptCategory;

  // Style elements - stored as key strings
  declare readonly style?: string;
  declare readonly mood?: string;
  declare readonly camera?: string;
  declare readonly scene?: string;
  declare readonly subject?: string;
  declare readonly action?: string;
  declare readonly cameraMovement?: string;
  declare readonly lens?: string;
  declare readonly lighting?: string;
  declare readonly fontFamily?: string;
  declare readonly blacklists?: string[];
  declare readonly sounds?: string[];
  declare readonly tags?: string[];

  // Model-specific fields
  declare readonly model?: string;

  // Additional metadata
  declare readonly duration?: number;
  declare readonly ratio?: string;
  declare readonly resolution?: string;
  declare readonly seed?: number;
  declare readonly reference?: string;
  declare readonly speech?: string;

  /** The prose sent to the model for the slots above, and what it was rendered for. */
  declare readonly renderedPrompt?: string;
  declare readonly renderTarget?: PromptRenderTarget;

  declare readonly isSkipEnhancement: boolean;

  declare readonly scope: AssetScope;

  declare readonly isFavorite: boolean;
}
