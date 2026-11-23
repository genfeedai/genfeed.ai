import type { Metadata } from 'next';
import { Suspense } from 'react';
import LogoutPage from './content';

export const metadata: Metadata = {
  title: 'Sign Out | Genfeed',
};

export default function AppLogoutPage() {
  return (
    <Suspense fallback={null}>
      <LogoutPage />
    </Suspense>
  );
}
