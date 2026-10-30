'use client';

import TagsPage from '@app/(protected)/admin/configuration/tags/[filter]/tags-page';
import { PageScope } from '@genfeedai/contracts';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import type { TagsFilterPageProps } from '@props/pages/page.props';
import { readRouteParam } from '@/lib/route-params';

export default function TagsFilterRoute() {
  const params = useRouteParams<Awaited<TagsFilterPageProps['params']>>();
  const filter = readRouteParam(params.filter) as Awaited<
    TagsFilterPageProps['params']
  >['filter'];

  return <TagsPage scope={PageScope.SUPERADMIN} filter={filter} />;
}
