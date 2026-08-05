import type { Metadata } from 'next';
import { Suspense } from 'react';
import LoginPage from './content';

export const metadata: Metadata = {
  title: 'Sign In | Genfeed',
};

export default function AppLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPage />
    </Suspense>
  );
}
