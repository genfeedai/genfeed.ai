'use client';

import { PageScope } from '@genfeedai/contracts';
import TrainingsList from '@pages/trainings/list/trainings-list';
import AdminOrgBrandUrlFilter from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { GraduationCap } from 'lucide-react';
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
    <AdminPageShell
      title="Trainings"
      icon={GraduationCap}
      onRefresh={() => {
        void handleRefresh();
      }}
      isRefreshing={isRefreshing}
      dropdowns={<AdminOrgBrandUrlFilter />}
    >
      <TrainingsList
        scope={PageScope.SUPERADMIN}
        onRefreshRegister={handleRefreshRegister}
      />
    </AdminPageShell>
  );
}
