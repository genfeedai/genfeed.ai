import type { IIngredient } from '@genfeedai/interfaces';
import type { ReactNode } from 'react';

export interface IngredientDropZoneProps {
  ingredient: IIngredient;
  onDrop: (
    droppedIngredient: Pick<IIngredient, 'id' | 'folder'>,
    targetIngredient: IIngredient,
  ) => void;
  children: ReactNode;
  isEnabled?: boolean;
}
