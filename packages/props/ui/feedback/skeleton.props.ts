export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export interface SkeletonMasonryProps {
  count?: number;
  className?: string;
}

export interface SkeletonCardProps {
  className?: string;
  showImage?: boolean;
  showTitle?: boolean;
  showDescription?: boolean;
  showActions?: boolean;
}

export interface SkeletonListProps {
  count?: number;
}

export interface SkeletonVideoGridProps {
  count?: number;
}

export interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
}
