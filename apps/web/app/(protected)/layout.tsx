import ProtectedLayoutClient from '@app/(protected)/protected-layout-client';
import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import messages from '@app-i18n/page-scopes/protected';
import type { LayoutProps } from '@props/layout/layout.props';
import { Suspense } from 'react';

export default function ProtectedLayout({ children }: LayoutProps) {
  return (
    <AppPageIntlProvider pages={messages}>
      <Suspense fallback={null}>
        <ProtectedLayoutClient initialBootstrap={null}>
          {children}
        </ProtectedLayoutClient>
      </Suspense>
    </AppPageIntlProvider>
  );
}
