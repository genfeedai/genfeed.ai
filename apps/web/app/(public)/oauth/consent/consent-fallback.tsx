'use client';

import { useTranslations } from 'next-intl';
import AuthFormLayout from '@/components/layouts/auth/AuthFormLayout';

/**
 * What the prerendered shell shows before the page reads its search params
 * (#10886): the heading the loaded page opens with, so the request swaps in
 * without the frame moving.
 */
export default function OAuthConsentFallback() {
  const translate = useTranslations('common.oauth.consent');

  return (
    <AuthFormLayout
      description={translate('description')}
      isWide
      logoSize="compact"
      title={translate('title')}
    >
      <div aria-busy="true" className="min-h-48 w-full" />
    </AuthFormLayout>
  );
}
