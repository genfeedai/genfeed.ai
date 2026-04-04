import type { IIngredient, IPrompt } from '@cloud/interfaces';
import { Prompt as BasePrompt } from '@genfeedai/client/models';
import { Ingredient } from '@models/content/ingredient.model';

export interface IExtendedPrompt extends Partial<IPrompt> {
  label?: string;
  description?: string;
  profileId?: string;
  useRAG?: boolean;
}

export class Prompt extends BasePrompt {
  public label?: string;
  public description?: string;
  public profileId?: string;
  public useRAG?: boolean;

  constructor(partial: IExtendedPrompt) {
    super(partial);

    if (partial?.ingredient && typeof partial.ingredient === 'object') {
      this.ingredient = new Ingredient(
        partial.ingredient,
      ) as unknown as IIngredient;
    }

    this.label = partial?.label;
    this.description = partial?.description;
    this.profileId = partial?.profileId;
    this.useRAG = partial?.useRAG;
  }

  public get promptText(): string | undefined {
    return this.enhanced ?? this.original;
  }
}
