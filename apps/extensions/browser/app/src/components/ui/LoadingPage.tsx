import type { ReactElement } from 'react';
import { LoadingSpinner } from '~components/ui/LoadingSpinner';

export function LoadingPage(): ReactElement {
  return (
    <div className="flex items-center justify-center py-8">
      <LoadingSpinner size="md" className="text-blue-500" />
    </div>
  );
}
