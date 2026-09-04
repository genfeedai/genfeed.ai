import { Suspense } from 'react';
import AdminModelsPageContent from './admin-models-page-content';

export default function ModelsTypePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  return (
    <Suspense fallback={null}>
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

  return <AdminModelsPageContent type={type} />;
}
