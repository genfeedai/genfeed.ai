import type { Metadata } from 'next';
import { Suspense } from 'react';
import AuthPageFallback from '@/components/layouts/auth/AuthPageFallback';
import LoginBetterAuth from '../login-better-auth';

export const metadata: Metadata = {
  alternates: { canonical: 'https://app.genfeed.ai/login/magic-link' },
  description:
    'Sign in to Genfeed with a secure magic link to access your content studio, brand assets, publishing workflows, and team workspace.',
  title: 'Sign In with a Magic Link | Genfeed',
  twitter: { card: 'summary' },
};

export default function MagicLinkLoginPage() {
  return (
    <Suspense fallback={<AuthPageFallback variant="login-magic" />}>
      <LoginBetterAuth mode="magic-link" />
    </Suspense>
  );
}
