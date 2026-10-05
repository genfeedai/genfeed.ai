'use client';

import type { DetailPageProps } from '@props/pages/page.props';

import TemplateDetail from '@protected/content/templates/[id]/template-detail';
import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function TemplateDetailRoute() {
  const params = useParams<Awaited<DetailPageProps['params']>>();
  const id = readRouteParam(params.id);

  return <TemplateDetail templateId={id} />;
}
