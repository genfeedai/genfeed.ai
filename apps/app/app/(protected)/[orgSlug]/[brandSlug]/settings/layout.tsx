'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';
import { HiOutlineCog6Tooth } from 'react-icons/hi2';

// Brand settings sub-navigation (Overview / Voice / Harness / Interview /
// Publishing / Agent Defaults) now lives in the Settings sidebar under the
// Brands group (see buildSettingsMenuItems), not in an in-page tab bar.
export default function BrandSettingsLayout({ children }: LayoutProps) {
  return (
    <Container
      label="Brand Settings"
      description="Manage voice, harness, publishing, and agent defaults for this brand"
      icon={HiOutlineCog6Tooth}
    >
      {children}
    </Container>
  );
}
