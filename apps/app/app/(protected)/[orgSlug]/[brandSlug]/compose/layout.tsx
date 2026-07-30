'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import Container from '@ui/layout/container/Container';
import { SquarePen } from 'lucide-react';

export default function ComposeLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="compose">
      <Container
        label="Write"
        description="Draft, refine, and prepare durable text content."
        icon={SquarePen}
      >
        {children}
      </Container>
    </FeatureGate>
  );
}
