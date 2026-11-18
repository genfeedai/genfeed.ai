'use client';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useTranslations } from 'next-intl';
import type { FirstDraftsChannelsProps } from '@/features/onboarding/props/first-drafts.props';
import ConnectPlatforms from './connect-platforms';

export default function ChannelsStep({ brandId }: FirstDraftsChannelsProps) {
  const t = useTranslations('pages.onboarding.firstDrafts');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{t('channels.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('channels.description')}
        </p>
      </div>
      <ConnectPlatforms
        brandId={brandId}
        returnTo={`${APP_ROUTES.ONBOARDING.BRAND}?step=channels`}
      />
    </div>
  );
}
