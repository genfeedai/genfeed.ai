'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';

type Props = {
  cachedLabel: string;
  onRetry: () => void;
};

export default function IngredientDetailCacheAlert({
  cachedLabel,
  onRetry,
}: Props) {
  return (
    <Alert variant="warning" className="mb-4">
      <AlertTitle>Live ingredient data is unavailable.</AlertTitle>
      <AlertDescription>
        Showing cached data{cachedLabel ? ` from ${cachedLabel}` : ''}.
      </AlertDescription>
      <AlertActions>
        <Button
          label="Retry"
          variant={ButtonVariant.SECONDARY}
          onClick={onRetry}
        />
      </AlertActions>
    </Alert>
  );
}
