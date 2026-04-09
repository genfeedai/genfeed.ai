'use client';

import { SignUp } from '@clerk/nextjs';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { useEffect, useState } from 'react';

export default function SignUpForm() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const params = new URLSearchParams(window.location.search);
    const plan = params.get('plan');
    if (plan) {
      localStorage.setItem('gf_selected_plan', plan);
    }
    const credits = params.get('credits');
    if (credits) {
      localStorage.setItem('gf_selected_credits', credits);
    }
  }, []);

  return (
    <AuthFormLayout>
      {isMounted && <SignUp routing="hash" signInUrl="/login" />}
    </AuthFormLayout>
  );
}
