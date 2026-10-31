'use client';

import IssueDetail from '@app/(protected)/[orgSlug]/[brandSlug]/tasks/[id]/issue-detail';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { readRouteParam } from '@/lib/route-params';

export default function IssueDetailRoute() {
  const params = useRouteParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return <IssueDetail issueId={id} useIdentifier={id.includes('-')} />;
}
