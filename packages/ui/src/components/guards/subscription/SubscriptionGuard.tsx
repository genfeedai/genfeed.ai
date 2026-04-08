'use client';

import { useUser } from '@clerk/nextjs';
import { SubscriptionStatus } from '@genfeedai/enums';
import { getClerkPublicData } from '@helpers/auth/clerk.helper';
import type { SubscriptionGuardProps } from '@props/guards/subscription-guard.props';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * SubscriptionGuard
 *
 * Wraps protected pages. If the current user does not have an active
 * subscription (status !== 'active' and !== 'trialing'), redirects
 * to /subscribe. Super admins bypass the check.
 *
 * Uses Clerk publicMetadata for a fast, synchronous check without
 * an extra API call.
 */
export default function SubscriptionGuard({
  children,
}: SubscriptionGuardProps) {
  const isBillingEnabled = Boolean(process.env.NEXT_PUBLIC_GENFEED_LICENSE_KEY);
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isLoaded || !user) {
      return;
    }

    const publicData = getClerkPublicData(user);

    // Super admins bypass subscription check
    if (publicData.isSuperAdmin) {
      setChecked(true);
      return;
    }

    if (!isBillingEnabled) {
      setChecked(true);
      return;
    }

    const status = publicData.stripeSubscriptionStatus;
    const isActive =
      status === SubscriptionStatus.ACTIVE ||
      status === SubscriptionStatus.TRIALING;

    if (!isActive) {
      router.replace('/onboarding/providers');
      return;
    }

    setChecked(true);
  }, [isBillingEnabled, isLoaded, user, router]);

  // Show nothing while checking (prevents flash of protected content)
  if (!isLoaded || !checked) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-700 rounded-full animate-spin dark:border-neutral-600 dark:border-t-neutral-300" />
      </div>
    );
  }

  return <>{children}</>;
}
