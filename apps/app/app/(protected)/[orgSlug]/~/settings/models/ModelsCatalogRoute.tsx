'use client';

import ModelsTypePageClientContent from '@app/(protected)/[orgSlug]/~/settings/models/[type]/page-content';
import { useSearchParams } from 'next/navigation';

// The catalog filter lives in `?type=`; the list resolves any value that is
// not a catalog group key (image, video, …) or `trainings` to the full catalog.
export default function ModelsCatalogRoute() {
  const searchParams = useSearchParams();
  const type = searchParams?.get('type') || 'all';

  return <ModelsTypePageClientContent type={type} />;
}
