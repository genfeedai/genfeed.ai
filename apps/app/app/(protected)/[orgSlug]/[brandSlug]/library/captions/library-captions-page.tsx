'use client';

import LibraryAssetTypeFilter from '@pages/ingredients/layout/library-asset-type-filter';
import Container from '@ui/layout/container/Container';
import type { ReactNode } from 'react';
import { HiOutlineChatBubbleBottomCenterText } from 'react-icons/hi2';

export default function LibraryCaptionsPage({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Container
      label="Captions"
      description="Captions, subtitles, and transcripts."
      icon={HiOutlineChatBubbleBottomCenterText}
      right={<LibraryAssetTypeFilter />}
    >
      {children}
    </Container>
  );
}
