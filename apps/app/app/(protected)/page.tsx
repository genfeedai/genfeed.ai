import ProtectedRootResolver from '@app/(protected)/root-resolver-client';
import { isBetterAuthEnabled } from '@genfeedai/auth-client/server';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';

const SEEDED_WORKSPACE_PATH = '/default/default/workspace/overview';

export const generateMetadata = createPageMetadata('Operational Home');

export default function ProtectedRootPage() {
  if (!isBetterAuthEnabled()) {
    redirect(SEEDED_WORKSPACE_PATH);
  }

  return <ProtectedRootResolver />;
}
