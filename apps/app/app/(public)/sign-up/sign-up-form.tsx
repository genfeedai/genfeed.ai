'use client';

import { SignUp } from '@clerk/nextjs';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { useEffect, useSyncExternalStore } from 'react';
import { isBetterAuthEnabled } from '@/lib/config/edition';
import { persistOnboardingHandoffParams } from '@/lib/onboarding/onboarding-access.util';
import SignUpBetterAuth from './sign-up-better-auth';

function subscribe() {
  return () => {};
}

function ClerkSignUpForm() {
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    persistOnboardingHandoffParams(window.location.search);
  }, []);

  return (
    <AuthFormLayout>
      {isMounted && <SignUp routing="hash" signInUrl="/login" />}
    </AuthFormLayout>
  );
}

export default function SignUpForm() {
  if (isBetterAuthEnabled()) {
    return <SignUpBetterAuth />;
  }

  return <ClerkSignUpForm />;
}
