import { BaseEntity } from '@api/shared/entities/base/base.entity';
import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  TransformationCategory,
} from '@genfeedai/enums';
import { type Ingredient } from '@genfeedai/prisma';

export class IngredientEntity extends BaseEntity implements Ingredient {
  declare readonly user: string;
  declare readonly metadata: string;
  declare readonly organization: string;
  declare readonly brand: string;
  declare readonly folder?: string;

  declare readonly votes?: string[];
  declare readonly parent?: string;
  declare readonly prompt?: string;
  declare readonly tags: string[];
  declare readonly sources?: string[];
  declare readonly training?: string;
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
