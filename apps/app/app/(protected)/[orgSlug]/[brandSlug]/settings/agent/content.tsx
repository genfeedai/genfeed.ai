'use client';

import { ButtonVariant } from '@genfeedai/contracts';

import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandWritingVoiceEditor from '@pages/brands/components/brand-kit/writing-voice/BrandWritingVoiceEditor';
import BrandDetailDefaultModelsCard from '@pages/brands/components/sidebar/BrandDetailDefaultModelsCard';
import BrandDetailIdentityCard from '@pages/brands/components/sidebar/BrandDetailIdentityCard';
import BrandDetailSystemPrompt from '@pages/brands/components/system-prompt/BrandDetailSystemPrompt';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import AgentLearningTab from './agent-learning-tab';
import AgentContext from './context/content';
import GenerationReceipts from './receipts/content';

const AGENT_TABS = ['defaults', 'context', 'learning', 'receipts'] as const;
export default function BrandAgentSettingsPage() {
  const t = useTranslations('pages.brandAgentSettings');
  const {
    brand,
    brandId,
    hasBrandId,
    isLoading,
    handleCopy,
    handleRefreshBrand,
  } = useBrandDetail();
  const { href } = useOrgUrl();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const requestedTab = params.get('tab');
  const tab = AGENT_TABS.find((entry) => entry === requestedTab) ?? 'defaults';
  if (!hasBrandId || isLoading) return <Loading isFullSize={false} />;
  if (!brand)
    return (
      <Container>
        <p className="text-sm text-muted-foreground">{t('brandMissing')}</p>
      </Container>
    );
  return (
    <Container fullWidth>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <Tabs
            activeTab={tab}
            ariaLabel={t('sectionsLabel')}
            fullWidth={false}
            className="ml-0"
            listClassName="ml-0"
            tabs={[
              { id: 'defaults', label: t('defaults') },
              { id: 'context', label: t('context') },
              { id: 'learning', label: t('learning') },
              { id: 'receipts', label: t('receipts') },
            ]}
            onTabChange={(value) => {
              const query = new URLSearchParams(params.toString());
              query.set('tab', value);
              router.replace(`${pathname}?${query}`, { scroll: false });
            }}
          />
          <Button asChild variant={ButtonVariant.SECONDARY} withWrapper={false}>
            <Link href={href('/settings/brand-kit?tab=voice')}>
              {t('writingVoice')}
            </Link>
          </Button>
        </div>
        {tab === 'context' ? (
          <AgentContext />
        ) : tab === 'learning' ? (
          <AgentLearningTab brandId={brandId} />
        ) : tab === 'receipts' ? (
          <GenerationReceipts />
        ) : (
          <div className="flex flex-col gap-3">
            <Card
              label={t('defaultsTitle')}
              description={t('defaultsDescription')}
            >
              <p className="text-xs leading-5 text-muted-foreground">
                {t('defaultsVoiceNote')}
              </p>
            </Card>
            <BrandDetailIdentityCard
              brand={brand}
              brandId={brandId}
              onRefreshBrand={() => handleRefreshBrand(true)}
            />
            <BrandDetailDefaultModelsCard brand={brand} />
            <BrandWritingVoiceEditor
              key={brandId}
              brand={brand}
              brandId={brandId}
              section="agent"
              onRefreshBrand={() => handleRefreshBrand(true)}
            />
            {brand.text ? (
              <BrandDetailSystemPrompt text={brand.text} onCopy={handleCopy} />
            ) : null}
          </div>
        )}
      </div>
    </Container>
  );
}
