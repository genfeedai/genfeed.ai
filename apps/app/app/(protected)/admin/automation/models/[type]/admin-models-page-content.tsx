'use client';

import { useModelsContext } from '@contexts/models/models-context/models-context';
import { PageScope } from '@genfeedai/contracts';
import ModelsList from '@pages/models/list/models-list';

export default function AdminModelsPageContent({ type }: { type: string }) {
  const { setRefreshModels } = useModelsContext();

  return (
    <ModelsList
      category={type}
      scope={PageScope.SUPERADMIN}
      onRefreshRegister={setRefreshModels}
    />
  );
}
