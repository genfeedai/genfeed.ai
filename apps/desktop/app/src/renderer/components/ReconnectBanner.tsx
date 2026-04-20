'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';

interface ReconnectBannerProps {
  onDismiss: () => void;
  onReconnect: () => void;
}

export default function ReconnectBanner({
  onDismiss,
  onReconnect,
}: ReconnectBannerProps) {
  return (
    <div className="flex w-full items-center justify-between bg-yellow-900/60 px-4 py-2 text-sm text-yellow-200">
      <span>Your cloud account is disconnected.</span>
      <div className="flex items-center gap-3">
        <Button
          onClick={onReconnect}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          className="font-medium text-yellow-100 underline hover:text-white"
        >
          Reconnect
        </Button>
        <span className="text-yellow-500">·</span>
        <Button
          onClick={onDismiss}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          className="text-yellow-400 hover:text-yellow-200"
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
