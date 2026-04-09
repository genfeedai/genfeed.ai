'use client';

import { useModelsContext } from '@contexts/models/models-context/models-context';
import { useTrainingsContext } from '@contexts/models/trainings-context/trainings-context';
import { PageScope } from '@genfeedai/enums';
import ModelsList from '@pages/models/list/models-list';
import TrainingsList from '@pages/trainings/list/trainings-list';

export default function ModelsTypePageClientContent({
  type,
}: {
  type: string;
}) {
  const { setRefreshModels } = useModelsContext();
  const { setRefreshTrainings } = useTrainingsContext();

  if (type === 'trainings') {
    return (
      <TrainingsList
        scope={PageScope.ORGANIZATION}
        onRefreshRegister={setRefreshTrainings}
      />
    );
  }

  return (
    <ModelsList
      category={type}
      scope={PageScope.ORGANIZATION}
      onRefreshRegister={setRefreshModels}
    />
  );
}
