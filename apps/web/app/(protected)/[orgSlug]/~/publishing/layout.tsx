import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import publishing from '@app-i18n/page-scopes/publishing';
import type { LayoutProps } from '@props/layout/layout.props';

export default function OrganizationPublishingLayout({
  children,
}: LayoutProps) {
  return (
    <AppPageIntlProvider pages={publishing}>{children}</AppPageIntlProvider>
  );
}
