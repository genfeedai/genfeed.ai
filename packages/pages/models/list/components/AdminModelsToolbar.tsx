'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type { AdminModelsToolbarProps } from '@props/admin/models.props';
import AdminOrgBrandUrlFilter from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import FormSearchbar from '@ui/primitives/searchbar';
import { Cpu } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AdminModelsActions from './AdminModelsActions';
import AdminModelsFilters from './AdminModelsFilters';

export default function AdminModelsToolbar({
  category,
  children,
  iconActions,
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
        <div className="w-48 sm:w-64">
          <FormSearchbar
            ariaLabel={translate('searchModels')}
            onSearch={onSearch}
            placeholder={translate('searchModels')}
            size={ComponentSize.SM}
            value={searchTerm}
          />
        </div>
      }
      filters={<AdminModelsFilters category={category} />}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      download={iconActions}
      dropdowns={<AdminOrgBrandUrlFilter />}
      primaryAction={<AdminModelsActions />}
    >
      {children}
    </AdminPageShell>
  );
}
