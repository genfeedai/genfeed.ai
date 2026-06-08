'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';
import { HiOutlineCog6Tooth } from 'react-icons/hi2';
import OrganizationSettingsLayout from '../(pages)/organization/layout';

export default function OrganizationSettingsContainerLayout({
  children,
}: LayoutProps) {
  return (
    <Container
      label="Settings"
      description="Manage your account, organization, and integrations"
      icon={HiOutlineCog6Tooth}
    >
      <OrganizationSettingsLayout>{children}</OrganizationSettingsLayout>
    </Container>
  );
}
