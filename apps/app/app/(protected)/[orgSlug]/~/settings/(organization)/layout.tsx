'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';
import OrganizationSettingsLayout from '../(pages)/organization/layout';

export default function OrganizationSettingsContainerLayout({
  children,
}: LayoutProps) {
  // No "Settings" title here: the breadcrumb ("Settings / <Page>") plus each
  // page's own Container heading already name the page. This wrapper previously
  // stacked a redundant "Settings" heading above every org settings page title.
  return (
    <Container>
      <OrganizationSettingsLayout>{children}</OrganizationSettingsLayout>
    </Container>
  );
}
