import { Ingredient } from '@api/collections/ingredients/schemas/ingredient.schema';
import { BaseEntity } from '@api/shared/entities/base/base.entity';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  TransformationCategory,
} from '@genfeedai/enums';
import { Types } from 'mongoose';

export class IngredientEntity extends BaseEntity implements Ingredient {
  declare readonly user: Types.ObjectId;
  declare readonly metadata: Types.ObjectId;
  declare readonly organization: Types.ObjectId;
  declare readonly brand: Types.ObjectId;
  declare readonly folder?: Types.ObjectId;

  declare readonly votes?: Types.ObjectId[];
  declare readonly parent?: Types.ObjectId;
  declare readonly prompt?: Types.ObjectId;
  declare readonly tags: Types.ObjectId[];
  declare readonly sources?: Types.ObjectId[];
  declare readonly training?: Types.ObjectId;
  declare readonly groupId?: string;
  declare readonly groupIndex?: number;
  declare readonly isMergeEnabled?: boolean;

  declare readonly category: IngredientCategory;
  declare readonly status: IngredientStatus;
  declare readonly scope: AssetScope;
  declare readonly transformations: TransformationCategory[];
  declare readonly order: number;
  declare readonly version: number;
  declare readonly qualityStatus: string;

  declare readonly isFavorite: boolean;
  declare readonly isHighlighted: boolean;
  declare readonly isDefault: boolean;
  declare readonly isPublic: boolean; // For public gallery visibility (getshareable.app)

  declare readonly totalVotes?: number;
  declare readonly totalChildren?: number;

  hasVoted?: boolean;
}
