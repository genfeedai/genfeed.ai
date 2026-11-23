import type { Metadata } from 'next';
import { Suspense } from 'react';
import AuthPageFallback from '@/components/layouts/auth/AuthPageFallback';
import ResetPasswordContent from './content';

export const metadata: Metadata = {
  title: 'Choose New Password | Genfeed',
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthPageFallback variant="reset" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
