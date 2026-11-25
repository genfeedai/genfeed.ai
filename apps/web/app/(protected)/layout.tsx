import ProtectedLayoutClient from '@app/(protected)/protected-layout-client';
import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import messages from '@app-i18n/page-scopes/protected';
import type { LayoutProps } from '@props/layout/layout.props';
import { Suspense } from 'react';
import ProtectedShellFallback from '@/components/shell/workspace-frame-skeleton/ProtectedShellFallback';

export default function ProtectedLayout({ children }: LayoutProps) {
  return (
    <AppPageIntlProvider pages={messages}>
      {/* The pathname is only known per request, so this boundary is what the
          prerendered shell shows: the app frame, not a blank page (#10886). */}
      <Suspense fallback={<ProtectedShellFallback />}>
        <ProtectedLayoutClient initialBootstrap={null}>
          {children}
        </ProtectedLayoutClient>
      </Suspense>
    </AppPageIntlProvider>
  );
}
