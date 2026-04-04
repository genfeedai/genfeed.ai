import type { SkeletonProps } from '@props/ui/feedback/skeleton.props';

export type SkeletonType =
  | 'masonry'
  | 'videoGrid'
  | 'brands'
  | 'table'
  | 'analytics'
  | 'gallery'
  | 'settings';

/**
 * Enhanced skeleton loading props that extend base skeleton props
 */
export interface SkeletonLoadingProps extends SkeletonProps {
  type?: SkeletonType;
  count?: number;
  rows?: number;
  columns?: number;
}
