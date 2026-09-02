'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useBrandDetail } from '@hooks/pages/use-brand-detail/use-brand-detail';
import BrandDetailDefaultModelsCard from '@pages/brands/components/sidebar/BrandDetailDefaultModelsCard';
import BrandDetailIdentityCard from '@pages/brands/components/sidebar/BrandDetailIdentityCard';
import BrandDetailSystemPrompt from '@pages/brands/components/system-prompt/BrandDetailSystemPrompt';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

/**
 * Agent defaults for this brand: speech/avatar identity, models, system prompt.
 * Writing brand voice (tone/pillars) is a dedicated page — not duplicated here.
 */
export default function BrandSettingsAgentDefaultsPage() {
  const {
    brand,
    brandId,
    hasBrandId,
    isLoading,
    handleCopy,
    handleRefreshBrand,
  } = useBrandDetail();
  const { href } = useOrgUrl();

  if (!hasBrandId || isLoading) {
    return <Loading isFullSize={false} />;
  }

  if (!brand) {
    return (
      <Container>
        <Card>
          <p className="text-sm text-muted-foreground">Brand not found.</p>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        <Card
          label="Agent defaults"
          description="Identity assets and model defaults for this brand’s agents. Writing voice is edited on Brand voice."
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs leading-5 text-muted-foreground">
              Tone, style, audience, and messaging pillars live under Brand
              voice. Harness shapes draft structure and delivery style.
            </p>
            <Button
              asChild
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              withWrapper={false}
            >
              <Link href={href('/settings/voice')}>Open brand voice</Link>
            </Button>
          </div>
        </Card>

        <BrandDetailIdentityCard
          brand={brand}
          brandId={brandId}
          onRefreshBrand={() => handleRefreshBrand(true)}
        />
        <BrandDetailDefaultModelsCard brand={brand} />
        {brand.text ? (
          <BrandDetailSystemPrompt text={brand.text} onCopy={handleCopy} />
        ) : null}
      </div>
    </Container>
  );
}
