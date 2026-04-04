import type { IngredientFormat } from '@genfeedai/enums';
import type { ReactNode } from 'react';

export interface ILazyLoadProps {
  children: ReactNode;
  threshold?: number;
  rootMargin?: string;
  fallback?: ReactNode;
  className?: string;
}

export interface ILazyLoadingFallbackProps {
  variant?: 'skeleton' | 'full' | 'minimal';
  aspectRatio?: IngredientFormat;
  isSpinnerEnabled?: boolean;
  className?: string;
}
