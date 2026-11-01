'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { Alert } from '@ui/primitives/alert';
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="font-medium">
            Live ingredient data is unavailable.
          </div>
          <div className="text-xs text-foreground/70">
            Showing cached data{cachedLabel ? ` from ${cachedLabel}` : ''}.
          </div>
        </div>
        <Button
          label="Retry"
          variant={ButtonVariant.SECONDARY}
          onClick={onRetry}
        />
      </div>
    </Alert>
  );
}
