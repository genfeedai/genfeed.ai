import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import messages from '@app-i18n/page-scopes/brand-settings';
import type { LayoutProps } from '@props/layout/layout.props';

/** Channels reuse the brand account table, which reads the brand settings messages. */
export default function ConnectorsChannelsLayout({ children }: LayoutProps) {
  return <AppPageIntlProvider pages={messages}>{children}</AppPageIntlProvider>;
}
