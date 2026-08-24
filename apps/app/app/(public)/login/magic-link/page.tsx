import { isDesktopServerRequest } from '@app-server/desktop-request.server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
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
    <Suspense fallback={null}>
      <DesktopAwareMagicLinkLoginPage />
    </Suspense>
  );
}

async function DesktopAwareMagicLinkLoginPage() {
  return (
    <LoginBetterAuth
      isDesktopShell={await isDesktopServerRequest()}
      mode="magic-link"
    />
  );
}
