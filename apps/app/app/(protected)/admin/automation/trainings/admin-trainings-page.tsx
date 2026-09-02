'use client';

import { PageScope } from '@genfeedai/contracts';
import TrainingsList from '@pages/trainings/list/trainings-list';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { Cpu } from 'lucide-react';
import { useCallback, useState } from 'react';

/**
 * Admin trainings surface: owns page chrome. TrainingsList is body-only
 * (table + filters), same split as Models settings layout + ModelsList.
 */
export default function AdminTrainingsPage() {
  const [refreshTrainings, setRefreshTrainings] = useState<
    (() => Promise<void>) | null
  >(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshRegister = useCallback(
    (fn: (() => Promise<void>) | null) => {
      setRefreshTrainings(() => fn);
    },
    [],
  );

  const handleRefresh = useCallback(async () => {
    if (!refreshTrainings) {
      return;
    }

    setIsRefreshing(true);
    try {
      await refreshTrainings();
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshTrainings]);

  return (
    <Container
      label="Trainings"
      description="Create and manage model trainings."
      icon={Cpu}
      right={
        <ButtonRefresh
          onClick={() => {
            void handleRefresh();
          }}
          isRefreshing={isRefreshing}
        />
      }
    >
      <TrainingsList
        scope={PageScope.SUPERADMIN}
        onRefreshRegister={handleRefreshRegister}
      />
    </Container>
  );
}
