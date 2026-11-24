import type { AssetScope } from '@genfeedai/contracts';
import type { IArticle, IIngredient } from '@genfeedai/contracts/interfaces';

export interface ScopeDropdownProps {
  item: IIngredient | IArticle;
  className?: string;
  onScopeChange?: (
    scope: AssetScope,
    updatedItem?: IIngredient | IArticle,
  ) => void;
}
