import type { ReactElement } from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  lg: 'size-12',
  md: 'size-8',
  sm: 'size-4',
};

export function LoadingSpinner({
  size = 'md',
  className = '',
}: LoadingSpinnerProps): ReactElement {
  return (
    <output
      className={`animate-spin rounded-full border-2 border-current border-t-transparent ${SIZES[size]} ${className}`}
      aria-label="Loading"
    />
  );
}
