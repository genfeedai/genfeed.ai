import ModelsTypePageClientContent from './page-content';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export default function ModelsTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ModelsTypePageLoader params={params} />
    </Suspense>
  );
}

async function ModelsTypePageLoader({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const { type } = await params;

  return <ModelsTypePageClientContent type={type} />;
}
