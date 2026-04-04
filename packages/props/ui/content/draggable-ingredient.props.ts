import type { IIngredient } from '@cloud/interfaces';
import type { ReactNode } from 'react';

export interface DraggableIngredientProps {
  ingredient: IIngredient;
  children: ReactNode;
  onDragStart?: (ingredient: IIngredient) => void;
  onDragEnd?: () => void;
  className?: string;
}
