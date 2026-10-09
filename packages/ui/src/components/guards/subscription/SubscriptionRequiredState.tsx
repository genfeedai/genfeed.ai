'use client';

import type { SubscriptionRequiredStateProps } from '@genfeedai/props/guards/subscription-guard.props';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

/** A denied feature's body; page navigation and help remain in the shell. */
export default function SubscriptionRequiredState({
  message,
  manageHref,
  manageLabel,
}: SubscriptionRequiredStateProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <p role="alert" className="max-w-lg text-sm text-muted-foreground">
        {message}
      </p>
      <Button asChild>
        <Link href={manageHref}>{manageLabel}</Link>
      </Button>
    </div>
  );
}
