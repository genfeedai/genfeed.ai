import type { ReactElement } from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  lg: 'h-12 w-12',
  md: 'h-8 w-8',
  sm: 'h-4 w-4',
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

export function LoadingPage(): ReactElement {
  return (
    <div className="flex items-center justify-center py-8">
      <LoadingSpinner size="md" className="text-blue-500" />
    </div>
  );
}

interface ButtonSpinnerProps {
  text?: string;
}

export function ButtonSpinner({
  text = 'Loading...',
}: ButtonSpinnerProps): ReactElement {
  return (
    <span className="flex items-center justify-center">
      <LoadingSpinner size="sm" className="-ml-1 mr-3 text-white" />
      {text}
    </span>
  );
}
