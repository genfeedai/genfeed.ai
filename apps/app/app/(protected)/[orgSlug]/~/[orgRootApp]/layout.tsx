import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import automation from '@app-i18n/page-scopes/automation';
import library from '@app-i18n/page-scopes/library';
import messages from '@app-i18n/page-scopes/messages';
import publishing from '@app-i18n/page-scopes/publishing';
import studio from '@app-i18n/page-scopes/studio';
import type { IntlMessageTree } from '@genfeedai/props/providers/intl-provider.props';
import type { LayoutProps } from '@props/layout/layout.props';

interface OrganizationAppIntlLayoutProps extends LayoutProps {
  params: Promise<{ orgRootApp: string }>;
}

const SCOPES: Readonly<Record<string, IntlMessageTree>> = {
  automation,
  library,
  messages,
  publishing,
  studio,
};

export default async function OrganizationAppIntlLayout({
  children,
  params,
}: OrganizationAppIntlLayoutProps) {
  const { orgRootApp } = await params;
  const pages = SCOPES[orgRootApp];
  return pages ? (
    <AppPageIntlProvider pages={pages}>{children}</AppPageIntlProvider>
  ) : (
    children
  );
}
