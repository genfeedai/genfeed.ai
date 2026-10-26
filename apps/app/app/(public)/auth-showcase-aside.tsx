'use client';

import type { AuthShowcaseVariant } from '@props/layout/auth-showcase.props';
import AuthShowcase from '@ui/layouts/auth/AuthShowcase';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

const VARIANTS: readonly AuthShowcaseVariant[] = ['wall', 'hero', 'stack'];

function parseVariant(value: string | null): AuthShowcaseVariant {
  return VARIANTS.find((variant) => variant === value) ?? 'wall';
}

/** Product showcase shown beside the login and sign-up forms. */
export default function AuthShowcaseAside() {
  const translate = useTranslations('common');
  const searchParams = useSearchParams();

  return (
    <AuthShowcase
      description={translate('authShowcase.description')}
      headline={translate('authShowcase.headline')}
      steps={[
        translate('authShowcase.stepCreate'),
        translate('authShowcase.stepReview'),
        translate('authShowcase.stepPublish'),
      ]}
      variant={parseVariant(searchParams.get('authLayout'))}
    />
  );
}
