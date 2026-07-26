import OperationalHomeContent from '@app/(protected)/home/content';
import ProtectedRootResolver from '@app/(protected)/root-resolver-client';
import { isBetterAuthEnabled } from '@genfeedai/auth-client/server';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Operational Home');

export default function ProtectedRootPage() {
  if (!isBetterAuthEnabled()) {
    return <OperationalHomeContent />;
  }

  return <ProtectedRootResolver />;
}
