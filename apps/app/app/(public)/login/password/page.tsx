import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginBetterAuth from '../login-better-auth';

export const metadata: Metadata = {
  title: 'Password Sign In | Genfeed',
};

export default function PasswordLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginBetterAuth mode="password" />
    </Suspense>
  );
}
