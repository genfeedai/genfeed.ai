'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';
import { SquarePen } from 'lucide-react';

export default function ArtifactsLayout({ children }: LayoutProps) {
  return (
    <Container
      label="Editor"
      description="Refine a draft the Agent produced."
      icon={SquarePen}
    >
      {children}
    </Container>
  );
}
