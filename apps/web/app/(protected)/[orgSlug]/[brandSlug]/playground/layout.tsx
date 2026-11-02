import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import messages from '@app-i18n/page-scopes/studio';
import type { LayoutProps } from '@props/layout/layout.props';
import StudioPlaygroundRoute from './StudioPlaygroundRoute';

export default function PageIntlLayout({ children }: LayoutProps) {
  return (
    <AppPageIntlProvider pages={messages}>
      <StudioPlaygroundRoute />
      {children}
    </AppPageIntlProvider>
  );
}
