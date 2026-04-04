import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import ModelsList from '@pages/models/list/models-list';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export default function ModelsTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ModelsTypePageContent params={params} />
    </Suspense>
  );
}

async function ModelsTypePageContent({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;

  return <ModelsList category={type} scope={PageScope.SUPERADMIN} />;
}
