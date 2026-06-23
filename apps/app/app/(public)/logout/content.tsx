'use client';

import { signOut } from '@genfeedai/auth-client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function LogoutPage() {
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
