'use client';

import { SignIn } from '@clerk/nextjs';
import AuthFormLayout from '@ui/layouts/auth/AuthFormLayout';
import { useEffect, useState } from 'react';

export default function LoginForm() {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  return (
    <AuthFormLayout>
      {isMounted && (
        <SignIn
          routing="hash"
          forceRedirectUrl="/overview"
          signUpForceRedirectUrl="/overview"
        />
      )}
    </AuthFormLayout>
  );
}
