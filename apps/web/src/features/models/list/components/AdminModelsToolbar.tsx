'use client';

import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Cpu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import SearchField from '@/components/content/search-field/SearchField';
import type { AdminModelsToolbarProps } from '@/features/models/props/models.props';
import AdminModelsActions from './AdminModelsActions';
import AdminModelsFilters from './AdminModelsFilters';

export default function AdminModelsToolbar({
  category,
  children,
  overflow,
  isRefreshing,
  onRefresh,
  onSearch,
  searchTerm,
}: AdminModelsToolbarProps) {
  const translate = useTranslations('pages.models');
  return (
    <AdminPageShell
      title={translate('title')}
      icon={Cpu}
      search={
        <SearchField
          ariaLabel={translate('searchModels')}
          onSearch={onSearch}
          placeholder={translate('searchModels')}
          value={searchTerm}
        >
          <AdminModelsFilters category={category} isAttached />
        </SearchField>
      }
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      overflow={overflow}
      primaryAction={<AdminModelsActions />}
    >
      {children}
    </AdminPageShell>
  );
}
