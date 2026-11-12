import { Suspense } from 'react';
import WorkspaceContentSkeleton from '@/components/shell/workspace-frame-skeleton/WorkspaceContentSkeleton';
import type { OrgRootAppEntryPageProps } from '@/props/layout/org-root-app-page.props';
import OrgRootAppSurface from './org-root-app-surface';

/**
 * The entry of one organization-level app that has its own static route
 * (`~/library`, `~/publishing`). Behind the dynamic `[orgRootApp]` segment the
 * router never painted these from a prefetch, whatever the page held: every
 * rail click waited on the server render. A static segment gets a prepared
 * frame. The surface that reads the URL (`params`, `searchParams`) sits inside
 * its own Suspense boundary so the frame around it stays in the prerendered
 * route shell.
 */
export default function OrgRootAppEntry({
  orgRootApp,
  params,
  searchParams,
}: OrgRootAppEntryPageProps & {
  orgRootApp: string;
}) {
  return (
    <Suspense fallback={<WorkspaceContentSkeleton />}>
      <OrgRootAppSurface
        params={params.then((resolved) => ({ ...resolved, orgRootApp }))}
        searchParams={searchParams}
      />
    </Suspense>
  );
}
