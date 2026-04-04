import type { ReactNode } from 'react';
import type { IIngredient } from '../index';
export interface DraggableIngredientProps {
    ingredient: IIngredient;
    children: ReactNode;
    onDragStart?: (ingredient: IIngredient) => void;
    onDragEnd?: () => void;
    className?: string;
}
//# sourceMappingURL=draggable-ingredient.interface.d.ts.map