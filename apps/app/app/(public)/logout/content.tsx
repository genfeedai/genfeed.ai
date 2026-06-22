'use client';

import { useClerk } from '@clerk/nextjs';
import { signOut } from '@genfeedai/auth-client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { isBetterAuthEnabled } from '@/lib/config/edition';

function BetterAuthLogoutPage() {
  const { push } = useRouter();

  useEffect(() => {
    let isCancelled = false;

    async function performSignOut() {
      await signOut();
      if (!isCancelled) {
        push('/login');
      }
    }

    performSignOut();

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

function ClerkLogoutPage() {
  const { signOut } = useClerk();

  useEffect(() => {
    signOut({ redirectUrl: '/login' });
  }, [signOut]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Signing out…</p>
    </div>
  );
}

export default function LogoutPage() {
  if (isBetterAuthEnabled()) {
    return <BetterAuthLogoutPage />;
  }

  return <ClerkLogoutPage />;
}
