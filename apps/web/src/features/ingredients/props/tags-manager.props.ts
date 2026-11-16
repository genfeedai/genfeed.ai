import type { IIngredient, ITag } from '@genfeedai/contracts/interfaces';

export interface TagsManagerComponentProps {
  ingredient: IIngredient;
  ingredientCategory: string;
  onTagsChange?: (tags: Array<ITag | string>) => void;
  isReadOnly?: boolean;
}
