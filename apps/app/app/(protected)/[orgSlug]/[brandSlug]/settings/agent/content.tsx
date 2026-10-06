'use client';

import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandWritingVoiceEditor from '@pages/brands/components/brand-kit/writing-voice/BrandWritingVoiceEditor';
import BrandDetailDefaultModelsCard from '@pages/brands/components/sidebar/BrandDetailDefaultModelsCard';
import BrandDetailIdentityCard from '@pages/brands/components/sidebar/BrandDetailIdentityCard';
import BrandDetailSystemPrompt from '@pages/brands/components/system-prompt/BrandDetailSystemPrompt';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import Tabs from '@ui/navigation/tabs/Tabs';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import AgentLearningTab from './agent-learning-tab';
import AgentContext from './context/content';
import GenerationReceipts from './receipts/content';

const AGENT_TABS = ['defaults', 'context', 'learning', 'receipts'] as const;
export default function BrandAgentSettingsPage() {
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
        <p className="text-sm text-muted-foreground">Brand not found.</p>
      </Container>
    );
  return (
    <Container fullWidth>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <Tabs
            activeTab={tab}
            ariaLabel="Agent settings sections"
            fullWidth={false}
            className="ml-0"
            listClassName="ml-0"
            tabs={[
              { id: 'defaults', label: 'Defaults' },
              { id: 'context', label: 'Context' },
              { id: 'learning', label: 'Learning' },
              { id: 'receipts', label: 'Generation receipts' },
            ]}
            onTabChange={(value) => {
              const query = new URLSearchParams(params.toString());
              query.set('tab', value);
              router.replace(`${pathname}?${query}`, { scroll: false });
            }}
          />
          <Button asChild variant="secondary" withWrapper={false}>
            <Link href={href('/settings/brand-kit?tab=voice')}>
              Writing voice
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
