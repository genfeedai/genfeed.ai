'use client';

import { signOut } from '@genfeedai/auth-client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LogoutPage() {
  const { push } = useRouter();

  useEffect(() => {
    let isCancelled = false;

    async function performSignOut() {
      try {
        await signOut();
      } catch {
        // Sign-out is best-effort from the client's perspective. Even if the
        // request rejects (e.g. the API is unreachable) we must still navigate
        // to /login rather than stranding the user on the "Signing out…" screen
        // with an unhandled promise rejection.
      }
      if (!isCancelled) {
        push('/login');
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
