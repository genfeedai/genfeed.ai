'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { BookOpen, Globe, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import KnowledgeSourcesList from './knowledge-sources-list';

export default function BrandSettingsKnowledgePage() {
  const { brandId, isReady, selectedBrand } = useBrand();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [seedRequestId, setSeedRequestId] = useState(0);
  const website = selectedBrand?.website ?? undefined;
  const translate = useTranslations('pages.library.knowledge');

  return (
    <Container
      description={translate('description')}
      icon={BookOpen}
      label={translate('title')}
      right={
        <div className="flex items-center gap-2">
          <Button
            icon={<Globe className="size-4" />}
            isDisabled={!brandId}
            label={translate('seedFromBrandKit')}
            onClick={() => setSeedRequestId((id) => id + 1)}
            variant={ButtonVariant.SECONDARY}
          />
          <Button
            icon={<Plus className="size-4" />}
            isDisabled={!brandId}
            label={translate('addSource')}
            onClick={() => setIsAddOpen(true)}
          />
        </div>
      }
    >
      {!isReady || !brandId ? (
        <Loading isFullSize={false} />
      ) : (
        <Suspense fallback={null}>
          <KnowledgeSourcesList
            brandId={brandId}
            isAddOpen={isAddOpen}
            key={brandId}
            onAddClose={() => setIsAddOpen(false)}
            onSeedHandled={() => setSeedRequestId(0)}
            seedRequestId={seedRequestId}
            website={website}
          />
        </Suspense>
      )}
    </Container>
  );
}
