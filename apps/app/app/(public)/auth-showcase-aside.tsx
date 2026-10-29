'use client';

import type { AuthShowcaseSlide } from '@props/layout/auth-showcase.props';
import AuthShowcase from '@ui/layouts/auth/AuthShowcase';
import { useTranslations } from 'next-intl';
import { AUTH_SHOWCASE_SLIDE_DEFINITIONS } from './auth-showcase-slides';

/** Generated examples shown beside the login and sign-up forms. */
export default function AuthShowcaseAside() {
  const translate = useTranslations('common');

  const slides: AuthShowcaseSlide[] = AUTH_SHOWCASE_SLIDE_DEFINITIONS.map(
    (slide) => ({
      ...slide,
      caption: translate(`authShowcase.slides.${slide.id}`),
      selectLabel: translate('authShowcase.select', {
        model: slide.modelLabel,
      }),
    }),
  );

  return (
    <AuthShowcase
      pauseLabel={translate('authShowcase.pause')}
      playLabel={translate('authShowcase.play')}
      regionLabel={translate('authShowcase.region')}
      slides={slides}
    />
  );
}
