import ProtectedRootResolver from '@app/(protected)/root-resolver-client';
import { redirect } from 'next/navigation';

const SEEDED_WORKSPACE_PATH = '/default/default/workspace/overview';

export default function ProtectedRootPage() {
  if (process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED === 'false') {
    redirect(SEEDED_WORKSPACE_PATH);
  }

  return <ProtectedRootResolver />;
}
