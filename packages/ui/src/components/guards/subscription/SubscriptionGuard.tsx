'use client';

import { useAccessState } from '@genfeedai/contexts/providers/access-state/access-state.provider';
import type { SubscriptionGuardProps } from '@genfeedai/props/guards/subscription-guard.props';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * SubscriptionGuard
 *
 * Wraps protected pages. If the current user does not have an active
 * subscription (status !== 'active' and !== 'trialing'), redirects
 * to /subscribe. Super admins bypass the check.
 *
 * Uses the DB-backed protected bootstrap access state.
 */
export default function SubscriptionGuard({
  children,
}: SubscriptionGuardProps) {
  const isBillingEnabled = Boolean(process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY);
  const { isLoading, isSubscribed, isSuperAdmin } = useAccessState();
  const { replace } = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (isSuperAdmin) {
      setChecked(true);
      return;
    }

    if (!isBillingEnabled) {
      setChecked(true);
      return;
    }

    if (!isSubscribed) {
      replace('/onboarding/providers');
      return;
    }

    setChecked(true);
  }, [isBillingEnabled, isLoading, isSubscribed, isSuperAdmin, replace]);

  // Show nothing while checking (prevents flash of protected content)
  if (isLoading || !checked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="size-6 border-2 border-neutral-300 border-t-neutral-700 rounded-full animate-spin dark:border-neutral-600 dark:border-t-neutral-300" />
      </div>
    );
  }

  return <>{children}</>;
}
