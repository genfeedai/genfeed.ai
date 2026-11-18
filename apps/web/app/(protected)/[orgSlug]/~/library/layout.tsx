import LibraryLayout from '@app/(protected)/[orgSlug]/[brandSlug]/library/layout-client';
import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import library from '@app-i18n/page-scopes/library';
import type { LayoutProps } from '@props/layout/layout.props';

// The organization Library is the brand Library across every brand, so it
// mounts the same layout (asset detail panel included).
export default function OrganizationLibraryLayout({ children }: LayoutProps) {
  return (
    <AppPageIntlProvider pages={library}>
      <LibraryLayout>{children}</LibraryLayout>
    </AppPageIntlProvider>
  );
}
