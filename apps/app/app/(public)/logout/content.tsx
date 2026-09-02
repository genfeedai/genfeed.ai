'use client';

import { signOut } from '@genfeedai/auth-client';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { resetAnalytics } from '@/lib/analytics';

export default function LogoutPage() {
  const { push } = useRouter();

  useEffect(() => {
    let isCancelled = false;

    async function performSignOut() {
      resetAnalytics();
      try {
        await signOut();
      } catch {
        // Sign-out is best-effort from the client's perspective. Even if the
        // request rejects (e.g. the API is unreachable) we must still navigate
        // to /login rather than stranding the user on the "Signing out…" screen
        // with an unhandled promise rejection.
      }
      if (!isCancelled) {
        push(APP_ROUTES.LOGIN);
      }
    }

    void performSignOut();

    return () => {
      isCancelled = true;
    };
  }, [push]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Signing out…</p>
    </div>
  );
}
