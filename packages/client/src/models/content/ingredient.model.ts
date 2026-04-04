import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  TransformationCategory,
} from '@genfeedai/enums';
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
} from '@genfeedai/interfaces';

export class Ingredient extends BaseEntity implements IIngredient {
  public declare user: IUser | string;
  public declare organization: IOrganization | string;
  public declare metadata: IMetadata | string;
  public declare brand?: IBrand | string;
  public declare script?: IIngredient | string;
  public declare parent?: IIngredient | string;
  public declare sources?: IIngredient[] | string[];
  public declare references?: IAsset[] | string[];
  public declare prompt?: IPrompt | string;
  public declare folder?: IFolder | string;
  public declare training?: ITraining | string;
  public declare category: IngredientCategory;
  public declare status: IngredientStatus;
  public declare transformations?: TransformationCategory[];
  public declare text?: string;
  public declare tags?: ITag[];
  public declare model?: string;
  public declare style?: string;
  public declare provider?: string;
  public declare duration?: number;
  public declare size?: number;
  public declare width?: number;
  public declare height?: number;
  public declare processingProgress?: number;
  public declare processingError?: string;
  public declare processingStartedAt?: string;
  public declare processingCompletedAt?: string;
  public declare views?: number;
  public declare likes?: number;
  public declare shares?: number;
  public declare scope: AssetScope;
  public declare isHighlighted: boolean;
  public declare isDefault: boolean;
  public declare isFavorite: boolean;
  public declare totalVotes: number;
  public declare totalChildren: number;
  public declare hasVoted: boolean;
  public declare isActive?: boolean;
  public declare isVoteAnimating: boolean;
  public declare personaSlug?: string;
  public declare reviewStatus?: string;
  public declare contentRating?: string;
  public declare campaign?: string;

  constructor(data: Partial<IIngredient> = {}) {
    super(data);
  }
}
