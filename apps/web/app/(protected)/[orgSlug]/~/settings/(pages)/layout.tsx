'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import Container from '@ui/layout/container/Container';

export default function SettingsLayout({ children }: LayoutProps) {
  // No title here: the breadcrumb ("Settings / <Page>") plus each page's own
  // Container heading already name the page. Rendering a "Settings" title here
  // stacked a redundant second heading above the page title.
  return <Container>{children}</Container>;
}
