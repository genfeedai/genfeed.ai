import { BaseEntity } from '@genfeedai/client/models/base/base-entity.model';
import type { AssetScope } from '@genfeedai/contracts';
import type {
  IIngredient,
  IPrompt,
  ITag,
} from '@genfeedai/contracts/interfaces';

export class Prompt extends BaseEntity implements IPrompt {
  declare public userId: string;
  declare public organizationId?: string;
  declare public brandId?: string;
  declare public category: string;
  declare public original: string;
  declare public enhanced: string;
  declare public status: string;
  declare public style?: string;
  declare public mood?: string;
  declare public camera?: string;
  declare public fontFamily?: string;
  declare public blacklists?: string[];
  declare public tags?: ITag[];
  declare public model?: string;
  declare public modelSettings?: Record<string, unknown>;
  declare public duration?: number;
  declare public ratio?: string;
  declare public resolution?: string;
  declare public fps?: number;
  declare public ingredients?: IIngredient[];
  declare public isSkipEnhancement: boolean;
  declare public systemPromptKey?: string;
  declare public scope?: AssetScope;
  declare public isFavorite?: boolean;
  declare public hasVoted: boolean;
  declare public totalVotes: number;
  declare public isVoteAnimating: boolean;

  constructor(data: Partial<IPrompt> = {}) {
    super(data);
  }
}
