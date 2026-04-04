import type { ITag } from '@genfeedai/interfaces';
import type {
  DropdownDirection,
  IngredientCategory,
  TagCategory,
} from '@genfeedai/enums';
import type { RefObject } from 'react';

export interface DropdownTagsProps {
  selectedTags: string[];
  onChange: (tagIds: string[]) => void;
  scope?: TagCategory | IngredientCategory;
  className?: string;
  placeholder?: string;
  direction?: DropdownDirection;
  isDisabled?: boolean;
  externalButtonRef?: RefObject<HTMLButtonElement>;
  /** Default: true */
  renderTrigger?: boolean;
  /** Default: true */
  showLabel?: boolean;
  /** If not provided, tags load on open */
  externalTags?: ITag[];
  isLoadingTags?: boolean;
}
