import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import messages from '@app-i18n/page-scopes/connect';
import type { LayoutProps } from '@props/layout/layout.props';
import ConnectorsShell from './connectors-shell';

export default function ConnectorsLayout({ children }: LayoutProps) {
  return (
    <AppPageIntlProvider pages={messages}>
      <ConnectorsShell>{children}</ConnectorsShell>
    </AppPageIntlProvider>
  );
}
