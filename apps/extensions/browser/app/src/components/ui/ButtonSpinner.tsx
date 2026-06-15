import type { ReactElement } from 'react';
import { LoadingSpinner } from '~components/ui/LoadingSpinner';

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
