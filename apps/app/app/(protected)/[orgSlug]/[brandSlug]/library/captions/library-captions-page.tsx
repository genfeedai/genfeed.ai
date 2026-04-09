'use client';

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
    >
      {children}
    </Container>
  );
}
