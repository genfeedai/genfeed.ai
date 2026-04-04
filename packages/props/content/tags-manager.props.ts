import type { IIngredient, ITag } from '@genfeedai/interfaces';
import type { Tag } from '@models/content/tag.model';

export interface TagsManagerProps {
  entityId: string;
  entityModel: 'Credential' | 'Ingredient';
  onTagsChange?: (tags: Tag[]) => void;
}

export interface TagsManagerComponentProps {
  ingredient: IIngredient;
  ingredientCategory: string;
  onTagsChange?: (tags: Array<ITag | string>) => void;
  isReadOnly?: boolean;
}
