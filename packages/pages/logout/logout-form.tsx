'use client';

import { useClerk } from '@clerk/nextjs';
import { clearTokenCache } from '@hooks/auth/use-authed-service/use-authed-service';
import { clearAllServiceInstances } from '@services/core/interceptor.service';
import { useEffect } from 'react';

export default function LogoutForm() {
  const { signOut } = useClerk();

  useEffect(() => {
    // Clear all cached HTTP service instances to prevent stale token usage
    clearTokenCache();
    clearAllServiceInstances();
    signOut({ redirectUrl: '/login' });
  }, [signOut]);

  return (
    <div className="min-h-screen flex flex-col justify-center items-center">
      <div className="text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Logging Out...</h1>

        <p className="text-xl max-w-2xl mx-auto mb-8">
          You are being signed out of your account
        </p>

        <p className="text-lg">Please wait while we sign you out...</p>
      </div>
    </div>
  );
}
