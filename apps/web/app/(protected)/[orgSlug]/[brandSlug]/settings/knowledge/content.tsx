'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import KnowledgeSourcesList from './knowledge-sources-list';

export default function BrandSettingsKnowledgePage() {
  const { brandId, isReady, selectedBrand } = useBrand();
  const translate = useTranslations('pages.library.knowledge');
  const loading = (
    <Container label={translate('title')} moduleChrome>
      <Loading isFullSize={false} />
    </Container>
  );

  if (!isReady || !brandId) {
    return loading;
  }

  return (
    <Suspense fallback={loading}>
      <KnowledgeSourcesList
        brandId={brandId}
        key={brandId}
        website={selectedBrand?.website ?? undefined}
      />
    </Suspense>
  );
}
