import ProtectedRootResolver from '@app/(protected)/root-resolver-client';
import { isBetterAuthEnabled } from '@genfeedai/auth-client/server';
import { redirect } from 'next/navigation';

const SEEDED_WORKSPACE_PATH = '/default/default/workspace/overview';

export default function ProtectedRootPage() {
  if (!isBetterAuthEnabled()) {
    redirect(SEEDED_WORKSPACE_PATH);
  }

  return <ProtectedRootResolver />;
}
