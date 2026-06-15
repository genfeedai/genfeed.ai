'use client';

import { SignUp } from '@clerk/nextjs';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { useEffect, useSyncExternalStore } from 'react';
import { persistOnboardingHandoffParams } from '@/lib/onboarding/onboarding-access.util';

function subscribe() {
  return () => {};
}

export default function SignUpForm() {
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
