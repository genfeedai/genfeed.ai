'use client';

import AdminModelsPageContent from '@app/(protected)/admin/automation/models/[type]/admin-models-page-content';
import { useSearchParams } from 'next/navigation';
import { resolveAdminModelType } from '@/features/models/props/models.props';

export default function FilteredListRoute() {
  const searchParams = useSearchParams();
  const valueValues = searchParams.getAll('type');
  const value = valueValues.length > 1 ? valueValues : valueValues[0];
  const selected = resolveAdminModelType(value);
  return <AdminModelsPageContent type={selected} />;
}
