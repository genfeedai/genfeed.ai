import type {
  ArticleStatus,
  IngredientStatus,
  PostStatus,
} from '@genfeedai/contracts';
import type {
  IArticle,
  IIngredient,
  IPost,
} from '@genfeedai/contracts/interfaces';

export interface StatusDropdownProps {
  entity: IIngredient | IArticle | IPost;
  className?: string;
  /** Stack the generating status vertically for narrow containers. */
  isStacked?: boolean;
  position?: 'bottom-full' | 'top-full' | 'auto';
  onStatusChange?: (
    status: IngredientStatus | ArticleStatus | PostStatus,
    updatedItem?: IIngredient | IArticle | IPost,
  ) => void;
}
