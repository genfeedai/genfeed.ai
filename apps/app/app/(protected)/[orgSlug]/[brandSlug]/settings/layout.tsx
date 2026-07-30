'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';

// Brand settings sub-navigation lives in the Settings sidebar under Brands
// (see buildSettingsMenuItems). Page identity is the topbar breadcrumb — do not
// stack a second "Brand Settings" heading (it collapses to sr-only and leaves
// dead top margin under the shell chrome).
export default function BrandSettingsLayout({ children }: LayoutProps) {
  return <Container>{children}</Container>;
}
