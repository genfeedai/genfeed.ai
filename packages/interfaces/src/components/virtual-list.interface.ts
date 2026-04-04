import type { ReactNode } from 'react';

export interface IVirtualListTailwindProps<T> {
  items: T[];
  itemHeight: number; // Fixed height for Tailwind classes
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  containerClassName?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingComponent?: ReactNode;
}

export interface IVirtualListPureProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
  itemClassName?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingComponent?: ReactNode;
  // For pure Tailwind, we use predefined height classes
  heightClass?:
    | 'h-64'
    | 'h-80'
    | 'h-96'
    | 'h-[400px]'
    | 'h-[500px]'
    | 'h-[600px]'
    | 'h-screen';
  itemHeightClass?: 'h-16' | 'h-20' | 'h-24' | 'h-32';
}

export interface IVirtualListProps<T> {
  items: T[];
  height: number;
  itemHeight: number | ((index: number) => number);
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingComponent?: ReactNode;
}

export interface IGridVirtualListProps<T> {
  items: T[];
  columns?: number;
  gap?: number;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
}

export interface IPaginatedListProps<T> {
  items: T[];
  itemsPerPage?: number;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
}
