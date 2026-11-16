import { type ReactNode, Suspense } from 'react';
import WorkspaceContentSkeleton from '@/components/shell/workspace-frame-skeleton/WorkspaceContentSkeleton';

/**
 * The frame of one organization-level app that has its own static route
 * (`~/library`, `~/publishing`). Behind the dynamic `[orgRootApp]` segment the
 * router never painted these from a prefetch, whatever the page held: every
 * rail click waited on the server render. A static segment gets a prepared
 * frame. The surface that reads the URL (`params`, `searchParams`) is passed in
 * as children and sits inside its own Suspense boundary, so the frame around it
 * stays in the prerendered route shell. Each page imports only its own surface,
 * which keeps one app's features out of the other routes' client manifests.
 */
export default function OrgRootAppEntry({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<WorkspaceContentSkeleton />}>{children}</Suspense>
  );
}
