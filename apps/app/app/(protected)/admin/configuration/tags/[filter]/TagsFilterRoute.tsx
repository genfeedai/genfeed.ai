'use client';

import TagsPage from '@app/(protected)/admin/configuration/tags/[filter]/tags-page';
import { PageScope } from '@genfeedai/contracts';
import type { TagsFilterPageProps } from '@props/pages/page.props';
import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function TagsFilterRoute() {
  const params = useParams<Awaited<TagsFilterPageProps['params']>>();
  const filter = readRouteParam(params.filter) as Awaited<
    TagsFilterPageProps['params']
  >['filter'];

  return <TagsPage scope={PageScope.SUPERADMIN} filter={filter} />;
}
