import type { ReactNode } from 'react';

export interface LazyLoadProps {
  children: ReactNode;
  placeholder?: ReactNode;
  rootMargin?: string;
  threshold?: number;
  minHeight?: string;
}
