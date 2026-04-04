import type { IIngredient, ITag } from '../index';

export interface IngredientTabsProps {
  ingredient: IIngredient | null;
  onClose: () => void;
  onUpdate?: (ingredient: IIngredient) => void;
}

export interface IngredientTabsInfoProps {
  ingredient: IIngredient;
  onUpdateMetadata?: (
    field: 'label' | 'description',
    value: string,
  ) => Promise<void>;
  isUpdating?: boolean;
}

export interface TabsIngredientInfoProps {
  ingredient: IIngredient;
  onReload?: () => void;
  onUpdateMetadata?: (field: 'label' | 'description', value: string) => void;
  isUpdating?: boolean;
}

export interface IngredientTabsPostsProps {
  ingredient: IIngredient;
}

export interface IngredientTabsMetadataProps {
  ingredient: IIngredient;
  isUpdating?: boolean;
  onUpdateSharing?: (field: string, value: boolean | string) => void;
  onRefresh?: () => Promise<void>;
}

export interface IngredientTabsPromptsProps {
  ingredient: IIngredient;
}

export interface ExtendedIngredientTabsTagsProps {
  ingredient: IIngredient;
  tags?: ITag[];
  onTagsUpdate?: (tags: ITag[]) => void;
  className?: string;
  onUpdate?: () => void;
  isPostMode?: boolean;
}
