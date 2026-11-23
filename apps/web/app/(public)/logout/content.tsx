'use client';

import { signOut } from '@genfeedai/auth-client';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { resetAnalytics } from '@/lib/analytics';
import { clearPersistedQueryCache } from '@/lib/query-cache/persisted-query-cache';

export default function LogoutPage() {
  const { push } = useRouter();

  // use-effect-audit: ignore abortable request
  useEffect(() => {
    const abortController = new AbortController();

    async function performSignOut() {
      resetAnalytics();
      // Nothing of the session stays on a shared device.
      await clearPersistedQueryCache();
      try {
        await signOut();
      } catch {
        // Sign-out is best-effort from the client's perspective. Even if the
        // request rejects (e.g. the API is unreachable) we must still navigate
        // to /login rather than stranding the user on the "Signing out…" screen
        // with an unhandled promise rejection.
      }
      if (!abortController.signal.aborted) {
        push(APP_ROUTES.LOGIN);
      }
    }

    void performSignOut();

    return () => {
      abortController.abort();
    };
  }, [push]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Signing out…</p>
    </div>
  );
}
