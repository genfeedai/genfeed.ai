import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import messages from '@app-i18n/page-scopes/workspace';
import type { LayoutProps } from '@props/layout/layout.props';

export default function PageIntlLayout({ children }: LayoutProps) {
  return <AppPageIntlProvider pages={messages}>{children}</AppPageIntlProvider>;
}
