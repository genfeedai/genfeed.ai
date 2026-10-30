'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import type { DetailPageProps } from '@props/pages/page.props';
import TemplateDetail from '@protected/content/templates/[id]/template-detail';
import { readRouteParam } from '@/lib/route-params';

export default function TemplateDetailRoute() {
  const params = useRouteParams<Awaited<DetailPageProps['params']>>();
  const id = readRouteParam(params.id);

  return <TemplateDetail templateId={id} />;
}
