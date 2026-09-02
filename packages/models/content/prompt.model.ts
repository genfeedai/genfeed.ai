import { Prompt as BasePrompt } from '@genfeedai/client/models';
import type { IIngredient, IPrompt } from '@genfeedai/contracts/interfaces';
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

    if (partial?.ingredients) {
      this.ingredients = partial.ingredients.map(
        (ingredient) => new Ingredient(ingredient) as unknown as IIngredient,
      );
    }

    this.label = partial?.label;
    this.description = partial?.description;
    this.profileId = partial?.profileId;
    this.useRAG = partial?.useRAG;
  }

  public get promptText(): string | undefined {
    return this.enhanced || this.original;
  }
}
