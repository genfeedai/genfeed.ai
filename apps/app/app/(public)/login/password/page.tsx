import { isDesktopServerRequest } from '@app-server/desktop-request.server';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginBetterAuth from '../login-better-auth';

export const metadata: Metadata = {
  title: 'Password Sign In | Genfeed',
};

export default function PasswordLoginPage() {
  return (
    <Suspense fallback={null}>
      <DesktopAwarePasswordLoginPage />
    </Suspense>
  );
}

async function DesktopAwarePasswordLoginPage() {
  return (
    <LoginBetterAuth
      isDesktopShell={await isDesktopServerRequest()}
      mode="password"
    />
  );
}
