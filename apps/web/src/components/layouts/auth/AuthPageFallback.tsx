'use client';

import AuthShowcaseAside from '@app/(public)/auth-showcase-aside';
import { useTranslations } from 'next-intl';
import AuthFormLayout from '@/components/layouts/auth/AuthFormLayout';
import type {
  AuthPageFallbackProps,
  AuthPageFallbackVariant,
} from '@/props/layout/auth-page-fallback.props';

/** The pages that sit beside the generated showcase, as their forms do. */
const VARIANTS_WITH_SHOWCASE: ReadonlySet<AuthPageFallbackVariant> = new Set([
  'login',
  'login-magic',
  'login-email',
  'sign-up',
  'sign-up-magic',
  'sign-up-email',
]);

/**
 * What an auth page shows in the prerendered shell, before the page reads its
 * search params (#10886). The frame, logo and heading are the page's own, so
 * the form swaps in without the page moving; the space under the heading is
 * held empty because the fields need the request's search params.
 */
export default function AuthPageFallback({ variant }: AuthPageFallbackProps) {
  const translate = useTranslations('common');

  return (
    <AuthFormLayout
      aside={
        VARIANTS_WITH_SHOWCASE.has(variant) ? <AuthShowcaseAside /> : undefined
      }
      description={translate(`authFallback.${variant}.description`)}
      logoSize="compact"
      title={translate(`authFallback.${variant}.title`)}
    >
      <div aria-busy="true" className="min-h-48 w-full" />
    </AuthFormLayout>
  );
}
