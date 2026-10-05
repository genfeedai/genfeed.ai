'use client';

import AdminModelsPageContent from '@app/(protected)/admin/automation/models/[type]/admin-models-page-content';
import { resolveAdminModelType } from '@props/admin/models.props';
import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function ModelsTypeRoute() {
  const params = useParams<{ type: string }>();
  const type = readRouteParam(params.type);

  return <AdminModelsPageContent type={resolveAdminModelType(type)} />;
}
