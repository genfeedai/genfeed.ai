import { Prompt } from '@api/collections/prompts/schemas/prompt.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import {
  AssetScope,
  ModelKey,
  PromptCategory,
  PromptStatus,
} from '@genfeedai/enums';
import { Types } from 'mongoose';

export class PromptEntity extends BaseEntity implements Prompt {
  declare readonly user: Types.ObjectId;
  declare readonly organization?: Types.ObjectId;
  declare readonly brand?: Types.ObjectId;
  declare readonly ingredient?: Types.ObjectId;
  declare readonly article?: Types.ObjectId;

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
  declare readonly tags?: Types.ObjectId[];

  // Model-specific fields
  declare readonly model?: ModelKey;

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
