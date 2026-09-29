import Spinner from '@ui/primitives/spinner';
import type { ReactElement } from 'react';

export function LoadingPage(): ReactElement {
  return (
    <div className="flex items-center justify-center py-8">
      <Spinner className="size-8 text-blue-500" />
    </div>
  );
}
