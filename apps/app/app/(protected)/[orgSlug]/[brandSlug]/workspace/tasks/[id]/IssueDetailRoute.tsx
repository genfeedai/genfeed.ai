'use client';

import IssueDetail from '@app/(protected)/[orgSlug]/[brandSlug]/tasks/[id]/issue-detail';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function IssueDetailRoute() {
  const params = useParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return <IssueDetail issueId={id} useIdentifier={id.includes('-')} />;
}
