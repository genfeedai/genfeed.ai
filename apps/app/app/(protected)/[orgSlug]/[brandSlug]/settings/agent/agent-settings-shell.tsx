'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

export default function AgentSettingsShell({
  children,
}: {
  children: ReactNode;
}) {
  const t = useTranslations('pages.brandAgentSettings');
  const { brand, hasBrandId, isLoading } = useBrandDetail();
  const { href } = useOrgUrl();
  if (!hasBrandId || isLoading) return <Loading isFullSize={false} />;
  if (!brand)
    return (
      <Container>
        <p className="text-sm text-muted-foreground">{t('brandMissing')}</p>
      </Container>
    );
  return (
    <Container
      fullWidth
      moduleChrome
      headerTabs={{
        ariaLabel: t('sectionsLabel'),
        fullWidth: false,
        tabs: [
          {
            href: href(APP_ROUTES.SETTINGS.AGENT),
            id: 'defaults',
            label: t('defaults'),
            matchMode: 'exact',
          },
          {
            href: href(APP_ROUTES.SETTINGS.AGENT_CONTEXT),
            id: 'context',
            label: t('context'),
          },
          {
            href: href(APP_ROUTES.SETTINGS.AGENT_LEARNING),
            id: 'learning',
            label: t('learning'),
          },
          {
            href: href(APP_ROUTES.SETTINGS.AGENT_RECEIPTS),
            id: 'receipts',
            label: t('receipts'),
          },
        ],
      }}
      right={
        <Button asChild variant={ButtonVariant.SECONDARY} withWrapper={false}>
          <Link href={href(APP_ROUTES.SETTINGS.BRAND_KIT_VOICE)}>
            {t('writingVoice')}
          </Link>
        </Button>
      }
    >
      <div className="space-y-5">{children}</div>
    </Container>
  );
}
