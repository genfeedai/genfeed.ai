'use client';

import { PageScope } from '@genfeedai/contracts';
import TrainingsList from '@pages/trainings/list/trainings-list';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
import { Cpu } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

/**
 * Admin trainings surface: owns page chrome. TrainingsList is body-only
 * (table + filters), same split as Models settings layout + ModelsList.
 */
export default function AdminTrainingsPage() {
  const refreshTrainingsRef = useRef<(() => Promise<void>) | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshRegister = useCallback(
    (fn: (() => Promise<void>) | null) => {
      refreshTrainingsRef.current = fn;
    },
    [],
  );

  const handleRefresh = useCallback(async () => {
    if (!refreshTrainingsRef.current) {
      return;
    }

    setIsRefreshing(true);
    try {
      await refreshTrainingsRef.current();
    } finally {
      setIsRefreshing(false);
    }
  }, []);

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
