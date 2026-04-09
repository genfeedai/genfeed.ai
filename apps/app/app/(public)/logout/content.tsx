'use client';

import { useClerk } from '@clerk/nextjs';
import { useEffect } from 'react';

export default function LogoutPage() {
  const { signOut } = useClerk();

  useEffect(() => {
    signOut({ redirectUrl: '/login' });
  }, [signOut]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-muted-foreground">Signing out...</p>
    </div>
  );
}
