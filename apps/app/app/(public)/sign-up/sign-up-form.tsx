'use client';

import { SignUp } from '@clerk/nextjs';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { useEffect, useState } from 'react';
import { persistOnboardingHandoffParams } from '@/lib/onboarding/onboarding-access.util';

export default function SignUpForm() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    persistOnboardingHandoffParams(window.location.search);
  }, []);

  return (
    <AuthFormLayout>
      {isMounted && <SignUp routing="hash" signInUrl="/login" />}
    </AuthFormLayout>
  );
}
