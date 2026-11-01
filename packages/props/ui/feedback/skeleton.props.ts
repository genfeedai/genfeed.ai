export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export interface SkeletonCardProps {
  label?: string;
  'data-testid'?: string;
  className?: string;
  showImage?: boolean;
  showTitle?: boolean;
  showDescription?: boolean;
  showActions?: boolean;
}

export interface SkeletonListProps {
  count?: number;
}
