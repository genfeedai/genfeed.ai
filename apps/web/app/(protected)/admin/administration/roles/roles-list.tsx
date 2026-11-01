'use client';

import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IRole } from '@genfeedai/contracts/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFilteredData } from '@hooks/utils/use-filtered-data/use-filtered-data';
import type { TableAction } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { RolesService } from '@services/organization/roles.service';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import { LazyModalRole } from '@/features/admin/lazy/lazy-modal.admin';

export default function RolesList() {
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const { openConfirm } = useConfirmModal();
  const currentPage = Number(useSearchParams().get('page')) || 1;
  const searchT = useTranslations('common.adminSearch');
  const { search, setSearch } = useAdminSearchParam();
  const getRolesService = useAuthedService((token: string) =>
    RolesService.getInstance(token),
  );

  const [roles, setRoles] = useState<IRole[]>([]);
  // The API returns every role, so the search narrows them in memory.
  const visibleRoles = useFilteredData({
    data: roles,
    filter: search,
    filterFields: (role) => [role.label, role.key],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedRole, setSelectedRole] = useState<IRole | null>(null);

  const columns = [
    { header: 'Label', key: 'label' },
    { className: 'font-mono text-sm', header: 'Key', key: 'key' },
    {
      header: 'Color',
      key: 'primaryColor',
      render: (role: IRole) =>
        role.primaryColor ? (
          <div className="flex items-center gap-2">
            <div
              className="size-4 rounded-full border border-border"
              style={{ backgroundColor: role.primaryColor }}
            />
            <span className="text-sm font-mono">{role.primaryColor}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">No color</span>
        ),
    },
  ];

  const actions: TableAction<IRole>[] = [
    {
      icon: <Pencil />,
      onClick: (r: IRole) => openRoleModal(ModalEnum.ROLE, r),
      tooltip: 'Edit',
    },
    {
      icon: <Trash2 />,
      onClick: (r: IRole) => {
        setSelectedRole(r);
        openConfirm({
          confirmLabel: 'Delete',
          isError: true,
          label: 'Delete Role',
          message: `Are you sure you want to delete "${r.label}"? This action cannot be undone.`,
          onConfirm: () => handleDelete(r),
        });
      },
      tooltip: 'Delete',
      tone: 'destructive',
    },
  ];

  const rowSidebar = createSummaryRowSidebar<IRole>({
    getFacts: (role) => [
      { id: 'key', label: fieldsT('key'), value: role.key },
      { id: 'color', label: fieldsT('color'), value: role.primaryColor },
    ],
    getId: (role) => role.id,
    getSubtitle: (role) => role.key,
    getTitle: (role) => role.label,
    kind: 'record',
    onEdit: (role) => openRoleModal(ModalEnum.ROLE, role),
  });

  const loadRoles = useCallback(
    async (refresh = false) => {
      if (!refresh) {
        setIsLoading(true);
      }
      setIsRefreshing(refresh);

      try {
        const service = await getRolesService();
        const data = await service.findAll({
          limit: ITEMS_PER_PAGE,
          page: currentPage,
        });
        setRoles(data);
      } catch (error) {
        logger.error('GET /roles failed', error);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [currentPage, getRolesService],
  );

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const openRoleModal = (modalId: ModalEnum, role?: IRole) => {
    setSelectedRole(role ?? null);
    openModal(modalId);
  };

  const handleDelete = async (role: IRole) => {
    try {
      const service = await getRolesService();
      await service.delete(role.id);
    } catch (error) {
      logger.error(`DELETE /roles/${role.id} failed`, error);
    } finally {
      loadRoles(true);
    }
  };

  return (
    <AdminPageShell
      title="Roles"
      icon={ShieldCheck}
      search={
        <SearchField
          ariaLabel={searchT('roles')}
          onSearch={setSearch}
          placeholder={searchT('roles')}
          value={search}
        />
      }
      onRefresh={() => loadRoles(true)}
      isRefreshing={isRefreshing}
      primaryAction={
        <Button
          label={
            <>
              <Plus /> Role
            </>
          }
          variant={ButtonVariant.DEFAULT}
          onClick={() => openRoleModal(ModalEnum.ROLE)}
        />
      }
    >
      <AppTable<IRole>
        items={visibleRoles}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item: IRole) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No roles found"
      />
      {search ? null : (
        <div className="mt-4">
          <AutoPagination showTotal totalLabel="roles" />
        </div>
      )}

      <LazyModalRole role={selectedRole} onConfirm={() => loadRoles(true)} />
    </AdminPageShell>
  );
}
