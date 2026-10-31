import type { IIngredient, ITag } from '@genfeedai/contracts/interfaces';

export interface ExtendedIngredientTabsTagsProps {
  ingredient: IIngredient;
  tags?: ITag[];
  onTagsUpdate?: (tags: ITag[]) => void;
  className?: string;
}
