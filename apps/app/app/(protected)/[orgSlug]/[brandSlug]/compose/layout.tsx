'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import Container from '@ui/layout/container/Container';
import { HiOutlinePencilSquare } from 'react-icons/hi2';

export default function ComposeLayout({ children }: LayoutProps) {
  return (
    <FeatureGate flagKey="compose">
      <Container
        label="Compose"
        description="Write, generate, and refine content for publishing."
        icon={HiOutlinePencilSquare}
      >
        {children}
      </Container>
    </FeatureGate>
  );
}
