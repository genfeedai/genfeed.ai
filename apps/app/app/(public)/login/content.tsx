'use client';

import { SignIn, useAuth } from '@clerk/nextjs';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import { isBetterAuthEnabled } from '@/lib/config/edition';
import LoginBetterAuth from './login-better-auth';

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

function ClerkLoginPage() {
  const isMounted = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const { isSignedIn, isLoaded } = useAuth();
  const { push } = useRouter();

  // Redirect authenticated users — handles cases where <SignIn> doesn't auto-redirect
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      push('/');
    }
  }, [isLoaded, isSignedIn, push]);

  return (
    <AuthFormLayout>
      {isMounted && (
        <SignIn
          routing="hash"
          fallbackRedirectUrl="/"
          appearance={{
            elements: {
              card: 'shadow-lg',
              rootBox: 'mx-auto',
            },
          }}
        />
      )}
    </AuthFormLayout>
  );
}

export default function LoginPage() {
  if (isBetterAuthEnabled()) {
    return <LoginBetterAuth />;
  }

  return <ClerkLoginPage />;
}
