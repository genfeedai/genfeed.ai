'use client';

import ModelsTypePageClientContent from '@app/(protected)/[orgSlug]/~/settings/models/[type]/page-content';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { readRouteParam } from '@/lib/route-params';

export default function ModelsTypeRoute() {
  const params = useRouteParams<{ type: string }>();
  const type = readRouteParam(params.type);

  return <ModelsTypePageClientContent type={type} />;
}
