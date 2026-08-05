import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginBetterAuth from '../login-better-auth';

export const metadata: Metadata = {
  title: 'Magic Link Sign In | Genfeed',
};

export default function MagicLinkLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginBetterAuth mode="magic-link" />
    </Suspense>
  );
}
