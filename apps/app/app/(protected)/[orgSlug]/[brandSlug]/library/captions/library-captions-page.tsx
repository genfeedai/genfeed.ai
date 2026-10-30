'use client';

import Container from '@ui/layout/container/Container';
import { MessageSquareText } from 'lucide-react';
import type { ReactNode } from 'react';
import LibraryAssetTypeFilter from '@/features/ingredients/layout/library-asset-type-filter';

export default function LibraryCaptionsPage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Container
      label="Captions"
      icon={MessageSquareText}
      right={<LibraryAssetTypeFilter />}
      titleVisibility="sr-only"
    >
      {children}
    </Container>
  );
}
