import type { IngredientCategory } from '@genfeedai/enums';
import type { ReactNode } from 'react';

export interface GenerationFeatureGuardProps {
  category: IngredientCategory;
  children: ReactNode;
}
