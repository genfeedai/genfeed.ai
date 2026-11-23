import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AuthPageFallback from '@/components/layouts/auth/AuthPageFallback';
import SignUpBetterAuth from '../sign-up-better-auth';

export const generateMetadata = createPageMetadata(
  'Create a Genfeed Account with Email',
  '/sign-up/password',
);

export default function SignUpPasswordPage() {
  return (
    <Suspense fallback={<AuthPageFallback variant="sign-up-email" />}>
      <SignUpBetterAuth mode="password" />
    </Suspense>
  );
}
