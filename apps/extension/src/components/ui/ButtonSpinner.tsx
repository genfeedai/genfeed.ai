import Spinner from '@ui/primitives/spinner';
import type { ReactElement } from 'react';

interface ButtonSpinnerProps {
  text?: string;
}

export function ButtonSpinner({
  text = 'Loading...',
}: ButtonSpinnerProps): ReactElement {
  return (
    <span className="flex items-center justify-center">
      <Spinner className="size-4 -ml-1 mr-3 text-primary-foreground" />
      {text}
    </span>
  );
}
