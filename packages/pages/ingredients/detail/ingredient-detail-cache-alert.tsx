'use client';

import { AlertCategory, ButtonVariant } from '@genfeedai/enums';
import Alert from '@ui/feedback/alert/Alert';
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
    <Alert type={AlertCategory.WARNING} className="mb-4">
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
          variant={ButtonVariant.OUTLINE}
          onClick={onRetry}
        />
      </div>
    </Alert>
  );
}
