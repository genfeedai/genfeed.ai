import type { Metadata } from 'next';
import { Suspense } from 'react';
import AuthPageFallback from '@/components/layouts/auth/AuthPageFallback';
import SignUpBetterAuth from '../sign-up-better-auth';

export const metadata: Metadata = {
  alternates: { canonical: 'https://app.genfeed.ai/sign-up/magic-link' },
  description:
    'Create your Genfeed workspace with a secure magic link and start generating, reviewing, scheduling, and publishing on-brand content.',
  title: 'Create a Genfeed Account with Magic Link',
  twitter: { card: 'summary' },
};

export default function SignUpMagicLinkPage() {
  return (
    <Suspense fallback={<AuthPageFallback variant="sign-up-magic" />}>
      <SignUpBetterAuth mode="magic-link" />
    </Suspense>
  );
}
