'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import NotFoundPage from '@pages/not-found/not-found-page';
import { useTranslations } from 'next-intl';

export default function CampaignUnavailableState() {
  const translate = useTranslations('pages.publishing.campaigns');
  const { href } = useOrgUrl();

  return (
    <NotFoundPage
      homeHref={href(APP_ROUTES.PUBLISHING.CAMPAIGNS)}
      homeLabel={translate('backToCampaigns')}
    />
  );
}
