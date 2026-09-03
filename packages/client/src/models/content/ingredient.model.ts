import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  TransformationCategory,
} from '@genfeedai/contracts';
import type {
  IAsset,
  IBrand,
  IFolder,
  IIngredient,
  IMetadata,
  IOrganization,
  IPrompt,
  ITag,
  ITraining,
  IUser,
} from '@genfeedai/contracts/interfaces';

export class Ingredient extends BaseEntity implements IIngredient {
  declare public userId?: string | null;
  declare public organizationId?: string | null;
  declare public brandId?: string | null;
  declare public parentId?: string | null;
  declare public promptId?: string | null;
  declare public metadataId?: string | null;
  declare public folderId?: string | null;
  declare public trainingId?: string | null;
  declare public user: IUser | string;
  declare public organization: IOrganization | string;
  declare public metadata: IMetadata | string;
  declare public brand?: IBrand | string;
  declare public script?: IIngredient | string;
  declare public parent?: IIngredient | string;
  declare public sources?: IIngredient[] | string[];
  declare public references?: IAsset[] | string[];
  declare public prompt?: IPrompt | string;
  declare public folder?: IFolder | string;
  declare public training?: ITraining | string;
  declare public category: IngredientCategory;
  declare public status: IngredientStatus;
  declare public transformations?: TransformationCategory[];
  declare public text?: string;
  declare public tags?: ITag[];
  declare public model?: string;
  declare public style?: string;
  declare public provider?: string;
  declare public duration?: number;
  declare public size?: number;
  declare public width?: number;
  declare public height?: number;
  declare public processingProgress?: number;
  declare public processingError?: string;
  declare public processingStartedAt?: string;
  declare public processingCompletedAt?: string;
  declare public views?: number;
  declare public likes?: number;
  declare public shares?: number;
  declare public scope: AssetScope;
  declare public isHighlighted: boolean;
  declare public isDefault: boolean;
  declare public isFavorite: boolean;
  declare public totalVotes: number;
  declare public totalChildren: number;
  declare public hasVoted: boolean;
  declare public isActive?: boolean;
  declare public isVoteAnimating: boolean;
  declare public personaSlug?: string;
  declare public reviewStatus?: string;
  declare public contentRating?: string;
  declare public campaign?: string;
  declare public cdnUrl?: string | null;
  declare public s3Key?: string | null;

  constructor(data: Partial<IIngredient> = {}) {
    super(data);
  }
}
