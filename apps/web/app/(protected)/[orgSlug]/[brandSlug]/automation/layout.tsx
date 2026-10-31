import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import messages from '@app-i18n/page-scopes/automation';
import type { LayoutProps } from '@props/layout/layout.props';
import LayoutContent from './layout-client';

export default function PageIntlLayout({ children }: LayoutProps) {
  return (
    <AppPageIntlProvider pages={messages}>
      <LayoutContent>{children}</LayoutContent>
    </AppPageIntlProvider>
  );
}
