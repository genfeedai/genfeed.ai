import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { AssetScope } from '@genfeedai/contracts';
import type {
  IIngredient,
  IPrompt,
  ITag,
} from '@genfeedai/contracts/interfaces';

export class Prompt extends BaseEntity implements IPrompt {
  public declare userId: string;
  public declare organizationId?: string;
  public declare brandId?: string;
  public declare category: string;
  public declare original: string;
  public declare enhanced: string;
  public declare status: string;
  public declare style?: string;
  public declare mood?: string;
  public declare camera?: string;
  public declare fontFamily?: string;
  public declare blacklists?: string[];
  public declare tags?: ITag[];
  public declare model?: string;
  public declare modelSettings?: Record<string, unknown>;
  public declare duration?: number;
  public declare ratio?: string;
  public declare resolution?: string;
  public declare fps?: number;
  public declare ingredients?: IIngredient[];
  public declare isSkipEnhancement: boolean;
  public declare systemPromptKey?: string;
  public declare scope?: AssetScope;
  public declare isFavorite?: boolean;
  public declare hasVoted: boolean;
  public declare totalVotes: number;
  public declare isVoteAnimating: boolean;

  constructor(data: Partial<IPrompt> = {}) {
    super(data);
  }
}
