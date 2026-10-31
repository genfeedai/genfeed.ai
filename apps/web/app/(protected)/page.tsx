import OperationalHomeContent from '@app/(protected)/home/content';
import ProtectedRootResolver from '@app/(protected)/root-resolver-client';
import AppPageIntlProvider from '@app-i18n/AppPageIntlProvider';
import workspaceMessages from '@app-i18n/page-scopes/workspace';
import { isBetterAuthEnabled } from '@genfeedai/auth-client/server';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Operational Home');

export default function ProtectedRootPage() {
  if (!isBetterAuthEnabled()) {
    return (
      <AppPageIntlProvider pages={workspaceMessages}>
        <OperationalHomeContent />
      </AppPageIntlProvider>
    );
  }

  return <ProtectedRootResolver />;
}
