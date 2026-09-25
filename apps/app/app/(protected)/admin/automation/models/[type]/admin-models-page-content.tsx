'use client';

import { useModelsContext } from '@contexts/models/models-context/models-context';
import { PageScope } from '@genfeedai/contracts';
import ModelsList from '@pages/models/list/models-list';
import type { AdminModelType } from '@props/admin/models.props';

export default function AdminModelsPageContent({
  type,
}: {
  type: AdminModelType;
}) {
  const { setRefreshModels } = useModelsContext();

  return (
    <ModelsList
      category={type}
      scope={PageScope.SUPERADMIN}
      onRefreshRegister={setRefreshModels}
    />
  );
}
