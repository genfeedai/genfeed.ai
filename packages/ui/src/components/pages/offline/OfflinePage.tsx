'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { OfflinePageProps } from '@props/pages/offline.props';
import Button from '@ui/buttons/base/Button';
import { PWA_APPS } from '@ui-constants/pwa/pwa-apps.constant';

/**
 * Offline fallback page displayed when user is disconnected from the internet
 */
export function OfflinePage({ appName }: OfflinePageProps) {
  const config = PWA_APPS[appName];

  const handleRetry = (): void => {
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-card p-4 text-center">
      <div className="max-w-md">
        <h1 className="mb-4 text-2xl font-bold text-foreground">
          You are offline
        </h1>

        <p className="mb-6 text-foreground/70">
          {config.displayName} requires an internet connection. Please check
          your connection and try again.
        </p>

        <Button
          onClick={handleRetry}
          variant={ButtonVariant.DEFAULT}
          type="button"
          label="Try Again"
        />
      </div>
    </div>
  );
}
