'use client';

import { PageScope } from '@genfeedai/contracts';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { GraduationCap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';
import AdminOrgBrandUrlFilter from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import TrainingsList from '@/features/trainings/list/trainings-list';

/**
 * Admin trainings surface: owns page chrome. TrainingsList is body-only
 * (table + filters), same split as Models settings layout + ModelsList.
 */
export default function AdminTrainingsPage() {
  const refreshTrainingsRef = useRef<(() => Promise<void>) | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const searchT = useTranslations('common.adminSearch');
  const { search, setSearch } = useAdminSearchParam();

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
      search={
        <SearchField
          ariaLabel={searchT('trainings')}
          onSearch={setSearch}
          placeholder={searchT('trainings')}
          value={search}
        />
      }
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
