'use client';

import LibraryAssetTypeFilter from '@pages/ingredients/layout/library-asset-type-filter';
import Container from '@ui/layout/container/Container';
import { MessageSquareText } from 'lucide-react';
import type { ReactNode } from 'react';

export default function LibraryCaptionsPage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Container
      label="Captions"
      description="Captions, subtitles, and transcripts."
      icon={MessageSquareText}
      right={<LibraryAssetTypeFilter />}
      titleVisibility="sr-only"
    >
      {children}
    </Container>
  );
}
