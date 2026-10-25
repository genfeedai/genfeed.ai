'use client';

import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandWritingVoiceEditor from '@pages/brands/components/brand-kit/writing-voice/BrandWritingVoiceEditor';
import BrandDetailDefaultModelsCard from '@pages/brands/components/sidebar/BrandDetailDefaultModelsCard';
import BrandDetailIdentityCard from '@pages/brands/components/sidebar/BrandDetailIdentityCard';
import BrandDetailSystemPrompt from '@pages/brands/components/system-prompt/BrandDetailSystemPrompt';
import Card from '@ui/card/Card';
import { useTranslations } from 'next-intl';

export default function AgentDefaults() {
  const t = useTranslations('pages.brandAgentSettings');
  const { brand, brandId, handleCopy, handleRefreshBrand } = useBrandDetail();
  if (!brand) return null;
  return (
    <div className="flex flex-col gap-3">
      <Card label={t('defaultsTitle')} description={t('defaultsDescription')}>
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
  );
}
