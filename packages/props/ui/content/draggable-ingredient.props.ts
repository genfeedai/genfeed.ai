import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { ReactNode } from 'react';

export interface DraggableIngredientProps {
  ingredient: IIngredient;
  children: ReactNode;
  onDragStart?: (ingredient: IIngredient) => void;
  onDragEnd?: () => void;
  className?: string;
}
