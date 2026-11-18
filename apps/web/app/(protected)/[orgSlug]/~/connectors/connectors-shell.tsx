'use client';

import type { LayoutProps } from '@props/layout/layout.props';
import { ErrorBoundary } from '@ui/display/error-boundary/ErrorBoundary';
import Container from '@ui/layout/container/Container';
import { Plug } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/**
 * What an organization connects (#9905): agents, AI providers, API keys and
 * webhooks. It lives at `/:org/~/connectors/*` and, so the brand stays
 * selected, at `/:org/:brand/connectors/*`. The sections are rows in the
 * Connectors sidebar, never a tab strip or a menu in the page. A section that
 * fails to load shows its own error and leaves the sidebar, and so the other
 * sections, usable.
 */
export default function ConnectorsShell({ children }: LayoutProps) {
  const translate = useTranslations('pages.connectors');
  const pathname = usePathname();

  return (
    <Container icon={Plug} label={translate('title')} moduleChrome>
      <ErrorBoundary
        description={translate('sectionErrorDescription')}
        key={pathname}
        presentation="inline"
        title={translate('sectionErrorTitle')}
      >
        {children}
      </ErrorBoundary>
    </Container>
  );
}
