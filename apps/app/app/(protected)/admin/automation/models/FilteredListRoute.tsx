'use client';

import AdminModelsPageContent from '@app/(protected)/admin/automation/models/[type]/admin-models-page-content';
import { resolveAdminModelType } from '@props/admin/models.props';
import { useSearchParams } from 'next/navigation';

export default function FilteredListRoute() {
  const searchParams = useSearchParams();
  const valueValues = searchParams.getAll('type');
  const value = valueValues.length > 1 ? valueValues : valueValues[0];
  const selected = resolveAdminModelType(value);
  return <AdminModelsPageContent type={selected} />;
}
