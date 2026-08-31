import { Suspense } from 'react';
import ModelsTypePageClientContent from './page-content';

export default function ModelsTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  return (
    <Suspense fallback={null}>
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
