'use client';

import ModelsTypePageClientContent from '@app/(protected)/[orgSlug]/~/settings/models/[type]/page-content';
import { useSearchParams } from 'next/navigation';

export default function FilteredListRoute() {
  const searchParams = useSearchParams();
  const valueValues = searchParams.getAll('type');
  const value = valueValues.length > 1 ? valueValues : valueValues[0];
  // Catalog group keys (image, video, …) and `trainings`; the list resolves
  // anything else to the unfiltered catalog.
  const selected = typeof value === 'string' && value ? value : 'all';
  return <ModelsTypePageClientContent type={selected} />;
}
