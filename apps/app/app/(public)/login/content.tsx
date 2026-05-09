'use client';

import { SignIn, useAuth } from '@clerk/nextjs';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const [isMounted, setIsMounted] = useState(false);
  const { isSignedIn, isLoaded } = useAuth();
  const { push } = useRouter();

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
