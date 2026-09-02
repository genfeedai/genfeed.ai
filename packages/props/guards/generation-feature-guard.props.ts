import type { IngredientCategory } from '@genfeedai/contracts';
import type { ReactNode } from 'react';

export interface GenerationFeatureGuardProps {
  category: IngredientCategory;
  children: ReactNode;
}
