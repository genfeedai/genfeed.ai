'use client';

import ModelsTypePageClientContent from '@app/(protected)/[orgSlug]/~/settings/models/[type]/page-content';
import { useSearchParams } from 'next/navigation';
import { resolveModelCategoryGroupKey } from '@/features/models/list/components/models-catalog-overview.helpers';

// The catalog filter lives in `?type=`. Only catalog groups (and the `images`
// / `videos` aliases) filter the list; anything else, including the body
// switches `trainings` and `custom-models` that ModelsTypePageClientContent
// reserves for its own routes, shows the unfiltered catalog.
export default function ModelsCatalogRoute() {
  const searchParams = useSearchParams();
  const type = resolveModelCategoryGroupKey(searchParams?.get('type')) ?? 'all';

  return <ModelsTypePageClientContent type={type} />;
}
