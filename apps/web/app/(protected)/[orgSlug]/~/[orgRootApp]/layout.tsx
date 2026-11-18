import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import automation from '@app-i18n/page-scopes/automation';
import messages from '@app-i18n/page-scopes/messages';
import studio from '@app-i18n/page-scopes/studio';
import type {
  IntlMessageTree,
  OrganizationAppIntlLayoutProps,
} from '@/props/providers/intl-provider.props';

// Library and Publishing have static entries (`~/library`, `~/publishing`) with
// their own layouts: behind this dynamic segment the router never painted them
// from a prefetch (#10040).
const SCOPES: Readonly<Record<string, IntlMessageTree>> = {
  automation,
  clipper: studio,
  editor: studio,
  messages,
  motion: studio,
  playground: studio,
  storyboard: studio,
  turbo: studio,
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

  return <AppPageIntlProvider pages={pages}>{children}</AppPageIntlProvider>;
}
