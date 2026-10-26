'use client';

import AuthShowcase from '@ui/layouts/auth/AuthShowcase';
import { useTranslations } from 'next-intl';

/** Background video shown beside the login and sign-up forms. */
export default function AuthShowcaseAside() {
  const translate = useTranslations('common');

  return (
    <AuthShowcase
      pauseLabel={translate('authShowcase.pause')}
      playLabel={translate('authShowcase.play')}
    />
  );
}
