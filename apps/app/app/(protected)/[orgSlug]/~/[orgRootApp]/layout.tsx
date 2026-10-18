import LibraryLayout from '@app/(protected)/[orgSlug]/[brandSlug]/library/layout-client';
import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import automation from '@app-i18n/page-scopes/automation';
import library from '@app-i18n/page-scopes/library';
import messages from '@app-i18n/page-scopes/messages';
import publishing from '@app-i18n/page-scopes/publishing';
import studio from '@app-i18n/page-scopes/studio';
import type {
  IntlMessageTree,
  OrganizationAppIntlLayoutProps,
} from '@genfeedai/props/providers/intl-provider.props';

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
  if (!pages) {
    return children;
  }

  // The organization Library is the brand Library across every brand, so it
  // mounts the same layout (asset detail panel included).
  if (orgRootApp === 'library') {
    return (
      <AppPageIntlProvider pages={pages}>
        <LibraryLayout>{children}</LibraryLayout>
      </AppPageIntlProvider>
    );
  }

  return <AppPageIntlProvider pages={pages}>{children}</AppPageIntlProvider>;
}
