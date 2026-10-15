'use client';

import { ComponentSize } from '@genfeedai/contracts';
import type { AdminModelsToolbarProps } from '@props/admin/models.props';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Container from '@ui/layout/container/Container';
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
    <Container
      label="Models"
      icon={Cpu}
      titleVisibility="sr-only"
      moduleChrome
      isTopbarPinned
      leading={
        <div className="flex items-center gap-2">
          <div className="w-48 sm:w-64">
            <FormSearchbar
              ariaLabel={translate('searchModels')}
              onSearch={onSearch}
              placeholder={translate('searchModels')}
              size={ComponentSize.SM}
              value={searchTerm}
            />
          </div>
          <AdminModelsFilters category={category} />
        </div>
      }
      right={<AdminModelsActions />}
      iconActions={
        <>
          {iconActions}
          <ButtonRefresh isRefreshing={isRefreshing} onClick={onRefresh} />
        </>
      }
      iconActionsPlacement="after-controls"
    >
      {children}
    </Container>
  );
}
