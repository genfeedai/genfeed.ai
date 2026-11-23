import type { Metadata } from 'next';
import { Suspense } from 'react';
import AuthPageFallback from '@/components/layouts/auth/AuthPageFallback';
import LoginBetterAuth from '../login-better-auth';

export const metadata: Metadata = {
  alternates: { canonical: 'https://app.genfeed.ai/login/password' },
  description:
    'Sign in to Genfeed with your email and password to access your content studio, brand assets, publishing workflows, and team workspace.',
  title: 'Sign In with Password | Genfeed',
  twitter: { card: 'summary' },
};

export default function PasswordLoginPage() {
  return (
    <Suspense fallback={<AuthPageFallback variant="login-email" />}>
      <LoginBetterAuth mode="password" />
    </Suspense>
  );
}
