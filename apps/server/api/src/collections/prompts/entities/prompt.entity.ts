import { BaseEntity } from '@api/shared/entities/base/base.entity';
import type {
  AssetScope,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/enums';

export class PromptEntity extends BaseEntity {
  declare readonly user: string;
  declare readonly organization?: string;
  declare readonly brand?: string;
  declare readonly ingredient?: string;
  declare readonly article?: string;

  declare readonly status: PromptStatus;
  declare readonly original: string;
  declare readonly enhanced: string;
  declare readonly category: PromptCategory;

  // Style elements - stored as key strings
  declare readonly style?: string;
  declare readonly mood?: string;
  declare readonly camera?: string;
  declare readonly scene?: string;
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

  declare readonly isSkipEnhancement: boolean;

  declare readonly scope: AssetScope;

  declare readonly isFavorite: boolean;
}
