'use client';

import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IRole } from '@genfeedai/contracts/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import { useFilteredData } from '@hooks/utils/use-filtered-data/use-filtered-data';
import type { TableAction } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { RolesService } from '@services/organization/roles.service';
import { normalizeElementKey } from '@ui/display/element-scope-badge/element-row-sidebar';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import { LazyModalRole } from '@/features/admin/lazy/lazy-modal.admin';
import { useInlineRecordSave } from '@/hooks/ui/use-inline-record-save/use-inline-record-save';

const EMPTY_ROLES: IRole[] = [];

export default function RolesList() {
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const { openConfirm } = useConfirmModal();
  const currentPage = Number(useSearchParams().get('page')) || 1;
  const searchT = useTranslations('common.adminSearch');
  const { search, setSearch } = useAdminSearchParam();
  const getRolesService = useAuthedService((token: string) =>
    RolesService.getInstance(token),
  );

  // Cached per page: coming back to Roles paints the rows it already has while
  // it refreshes, and paging keeps the current rows on screen.
  const rolesQuery = usePagedAuthedQuery({
    keepPreviousDataWithin: ['admin', 'roles'],
    queryFn: async (service, signal) => {
      try {
        return await service.findAll(
          { limit: ITEMS_PER_PAGE, page: currentPage },
          signal,
        );
      } catch (error) {
        logger.error('GET /roles failed', error);
        throw error;
      }
    },
    queryKey: ['admin', 'roles', { page: currentPage }],
    service: (token: string) => RolesService.getInstance(token),
  });
  const roles = rolesQuery.data?.items ?? EMPTY_ROLES;
  const { isLoading } = rolesQuery;
  const isRefreshing = rolesQuery.isFetching && !isLoading;
  const { refetch } = rolesQuery;
  const loadRoles = useCallback(() => {
    void refetch();
  }, [refetch]);
  // The API returns every role, so the search narrows them in memory.
  const visibleRoles = useFilteredData({
    data: roles,
    filter: search,
    filterFields: (role) => [role.label, role.key],
  });

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
      icon: <Trash2 />,
      onClick: (r: IRole) => {
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

  const saveRole = useInlineRecordSave<Partial<IRole>>({
    errorMessage: 'Failed to update role',
    onSaved: () => loadRoles(),
    save: async (id, patch) => (await getRolesService()).patch(id, patch),
  });

  const rowSidebar = createSummaryRowSidebar<IRole>({
    getFacts: (role) => [
      {
        editor: {
          ariaLabel: fieldsT('label'),
          isRequired: true,
          kind: 'text',
          onSave: (label) => saveRole(role.id, { label }),
          value: role.label,
        },
        id: 'label',
        label: fieldsT('label'),
      },
      {
        editor: {
          ariaLabel: fieldsT('key'),
          isRequired: true,
          kind: 'text',
          onSave: (key) => saveRole(role.id, { key: normalizeElementKey(key) }),
          value: role.key,
        },
        id: 'key',
        label: fieldsT('key'),
      },
      {
        editor: {
          ariaLabel: fieldsT('color'),
          isRequired: true,
          kind: 'text',
          onSave: (primaryColor) => saveRole(role.id, { primaryColor }),
          placeholder: '#000000',
          value: role.primaryColor,
        },
        id: 'color',
        label: fieldsT('color'),
      },
    ],
    getId: (role) => role.id,
    getSubtitle: (role) => role.key,
    getTitle: (role) => role.label,
    kind: 'record',
  });

  const handleDelete = async (role: IRole) => {
    try {
      const service = await getRolesService();
      await service.delete(role.id);
    } catch (error) {
      logger.error(`DELETE /roles/${role.id} failed`, error);
    } finally {
      loadRoles();
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
      onRefresh={() => loadRoles()}
      isRefreshing={isRefreshing}
      primaryAction={
        <Button
          label={
            <>
              <Plus /> Role
            </>
          }
          variant={ButtonVariant.DEFAULT}
          onClick={() => openModal(ModalEnum.ROLE)}
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
          <AutoPagination
            showTotal
            totalLabel="roles"
            totals={rolesQuery.data?.totals}
          />
        </div>
      )}

      <LazyModalRole onConfirm={() => loadRoles()} />
    </AdminPageShell>
  );
}
