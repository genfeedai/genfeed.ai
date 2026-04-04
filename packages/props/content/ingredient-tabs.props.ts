import type { IIngredient, ITag } from '@cloud/interfaces';

export interface ExtendedIngredientTabsTagsProps {
  ingredient: IIngredient;
  tags?: ITag[];
  onTagsUpdate?: (tags: ITag[]) => void;
  className?: string;
}
