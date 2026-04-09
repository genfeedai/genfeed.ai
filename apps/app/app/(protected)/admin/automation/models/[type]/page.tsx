import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@genfeedai/enums';
import ModelsList from '@pages/models/list/models-list';
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
