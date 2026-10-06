import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import type { Dispatch, SetStateAction } from 'react';

export interface FailedIngredientsRecoveryProps {
  ingredients: IIngredient[];
  selectedIds: string[];
  isActionsEnabled: boolean;
  isRecovering: boolean;
  retriedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onDelete: (ids: string[]) => void;
  onRetry: (ingredients: IIngredient[]) => void;
  onInspect: (ingredient: IIngredient) => void;
  onReview: (ingredient: IIngredient) => void;
  /** Existing Library pinned toolbar action slot. */
  actionSlot?: HTMLElement | null;
}

export interface FailedIngredientRowProps
  extends Pick<
    FailedIngredientsRecoveryProps,
    | 'isActionsEnabled'
    | 'isRecovering'
    | 'onDelete'
    | 'onRetry'
    | 'onInspect'
    | 'onReview'
  > {
  ingredient: IIngredient;
  isSelected: boolean;
  hasRetried: boolean;
  onToggle: () => void;
}

export interface FailedIngredientPreviewProps {
  ingredient: IIngredient;
}

export interface UseFailedIngredientRecoveryProps {
  scopeKey: string;
  brandId?: string | null;
  ingredients: IIngredient[];
  getService: () => Promise<IngredientsService>;
  setIngredients: Dispatch<SetStateAction<IIngredient[]>>;
  setSelectedIds: Dispatch<SetStateAction<string[]>>;
  onRefresh: (isRefreshing?: boolean) => Promise<void>;
}

export interface UseFailedIngredientRecoveryReturn {
  handleDeleteFailedIngredients: (ids: string[]) => void;
  handleRetryFailedIngredients: (ingredients: IIngredient[]) => void;
  handleReviewFailedIngredient: (ingredient: IIngredient) => Promise<void>;
  isRecovering: boolean;
  retriedIds: string[];
}
