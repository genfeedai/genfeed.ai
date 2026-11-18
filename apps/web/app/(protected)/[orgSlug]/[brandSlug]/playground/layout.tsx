import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import messages from '@app-i18n/page-scopes/studio';
import type { LayoutProps } from '@props/layout/layout.props';
import OrganizationModulePreferenceGate from '@/components/guards/organization-module/OrganizationModulePreferenceGate';

// The app is a release item: until it is released to the organization the
// route shows the hidden state. The API and MCP are not affected.
export default function PageIntlLayout({ children }: LayoutProps) {
  return (
    <AppPageIntlProvider pages={messages}>
      <OrganizationModulePreferenceGate moduleId="playground">
        {children}
      </OrganizationModulePreferenceGate>
    </AppPageIntlProvider>
  );
}
