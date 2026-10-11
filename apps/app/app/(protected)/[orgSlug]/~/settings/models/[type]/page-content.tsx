'use client';

import OrganizationCustomModelsCard from '@app/(protected)/[orgSlug]/~/settings/(pages)/organization/custom-models/organization-custom-models-card';
import { useModelsContext } from '@contexts/models/models-context/models-context';
import { useTrainingsContext } from '@contexts/models/trainings-context/trainings-context';
import { PageScope } from '@genfeedai/contracts';
import ModelsList from '@pages/models/list/models-list';
import TrainingsList from '@pages/trainings/list/trainings-list';

export default function ModelsTypePageClientContent({
  type,
}: {
  type: string;
}) {
  const { setRefreshModels } = useModelsContext();
  const { setRefreshTrainings } = useTrainingsContext();

  if (type === 'custom-models') {
    return <OrganizationCustomModelsCard />;
  }

  if (type === 'trainings') {
    // Body-only list: Models layout owns tabs, refresh, and create chrome.
    return (
      <TrainingsList
        scope={PageScope.ORGANIZATION}
        onRefreshRegister={setRefreshTrainings}
      />
    );
  }

  return (
    <ModelsList
      type={type}
      scope={PageScope.ORGANIZATION}
      onRefreshRegister={setRefreshModels}
    />
  );
}
