'use client';

import ModelsTypePageClientContent from '@app/(protected)/[orgSlug]/~/settings/models/[type]/page-content';
import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function ModelsTypeRoute() {
  const params = useParams<{ type: string }>();
  const type = readRouteParam(params.type);

  return <ModelsTypePageClientContent type={type} />;
}
