import type { IArticle, IIngredient } from '@genfeedai/interfaces';
import type { AssetScope } from '@genfeedai/enums';

export interface ScopeDropdownProps {
  item: IIngredient | IArticle;
  className?: string;
  position?: 'bottom-full' | 'top-full' | 'auto';
  onScopeChange?: (
    scope: AssetScope,
    updatedItem?: IIngredient | IArticle,
  ) => void;
}
