'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import Container from '@ui/layout/container/Container';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { BookOpen, Globe, Plus } from 'lucide-react';
import { Suspense, useState } from 'react';
import KnowledgeSourcesList from './knowledge-sources-list';

export default function LibraryKnowledgePage() {
  const { brandId, isReady, selectedBrand } = useBrand();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [seedRequestId, setSeedRequestId] = useState(0);
  const website = selectedBrand?.website ?? undefined;

  return (
    <Container
      description="Sources Genfeed grounds your generations on, with citations."
      icon={BookOpen}
      label="Knowledge"
      right={
        <div className="flex items-center gap-2">
          <Button
            icon={<Globe className="size-4" />}
            isDisabled={!brandId}
            label="Seed from Brand Kit"
            onClick={() => setSeedRequestId((id) => id + 1)}
            variant={ButtonVariant.SECONDARY}
          />
          <Button
            icon={<Plus className="size-4" />}
            isDisabled={!brandId}
            label="Add source"
            onClick={() => setIsAddOpen(true)}
          />
        </div>
      }
      titleVisibility="sr-only"
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
