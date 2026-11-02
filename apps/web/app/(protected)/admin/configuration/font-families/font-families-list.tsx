'use client';

import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ButtonVariant, ModalEnum, PageScope } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type {
  IFontFamily,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import type { FontFamily } from '@models/elements/font-family.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { FontFamiliesService } from '@services/elements/font-families.service';
import { createSummaryRowSidebar } from '@ui/display/table/summary-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Button } from '@ui/primitives/button';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useState } from 'react';
import AdminOrgBrandUrlFilter, {
  useAdminOrgBrandParams,
} from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import SearchField from '@/components/content/search-field/SearchField';
import { LazyModalFontFamily } from '@/components/lazy/modal/LazyModal';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

const FONT_FAMILY_SORT_KEYS = ['label', 'key'];

const EMPTY_FONT_FAMILIES: FontFamily[] = [];

function FontFamiliesListContent({
  scope = PageScope.BRAND,
}: IElementContentProps) {
  const notificationsService = NotificationsService.getInstance();
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const { openConfirm } = useConfirmModal();

  const searchParams = useSearchParams();
  const searchT = useTranslations('common.adminSearch');
  const { search, setSearch } = useAdminSearchParam();
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: FONT_FAMILY_SORT_KEYS,
  });
  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  const getFontFamiliesService = useAuthedService(
    useCallback((token: string) => FontFamiliesService.getInstance(token), []),
  );

  const [selectedFontFamily, setSelectedFontFamily] =
    useState<IFontFamily | null>(null);

  const columns: TableColumn<FontFamily>[] = [
    {
      header: 'Label',
      key: 'label',
      sortable: true,
      subtext: (fontFamily: FontFamily) => fontFamily.description,
    },
    {
      className: 'font-mono text-sm',
      header: 'Key',
      key: 'key',
      sortable: true,
    },
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <Pencil />,
            onClick: (fontFamily: FontFamily) =>
              openFontFamilyModal(ModalEnum.FONT_FAMILY, fontFamily),
            tooltip: 'Edit',
          },
          {
            icon: <Trash2 />,
            onClick: (fontFamily: FontFamily) => {
              setSelectedFontFamily(fontFamily);
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Font Family',
                message: `Are you sure you want to delete "${fontFamily.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(fontFamily),
              });
            },
            tooltip: 'Delete',
          },
        ]
      : [];

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;

  // Cached per page, search, sort and scope: coming back to Font Families
  // paints the rows it already has while it refreshes, and paging keeps the
  // current rows on screen.
  const scopeFilter =
    scope === PageScope.SUPERADMIN
      ? {
          ...(adminOrg ? { organization: adminOrg } : {}),
          ...(adminBrand ? { brand: adminBrand } : {}),
        }
      : {};
  const scopeKey = ['admin', 'font-families', { scope, ...scopeFilter }];
  const fontFamiliesQuery = usePagedAuthedQuery({
    keepPreviousDataWithin: scopeKey,
    queryFn: async (service, signal) => {
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        ...(search ? { search } : {}),
        ...(sort ? { sort } : {}),
        ...scopeFilter,
      };
      try {
        const data = await service.findAll(query, signal);
        logger.info('GET /font-families success', data);
        return data;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /font-families failed', error);
        }
        throw error;
      }
    },
    queryKey: [...scopeKey, { page: currentPage, search, sort }],
    service: (token: string) => FontFamiliesService.getInstance(token),
  });
  const fontFamilies = fontFamiliesQuery.data?.items ?? EMPTY_FONT_FAMILIES;
  const { errorUpdatedAt, isError, isLoading, refetch } = fontFamiliesQuery;
  const isRefreshing = fontFamiliesQuery.isFetching && !isLoading;
  const findAllFontFamilies = useCallback(() => {
    void refetch();
  }, [refetch]);

  // One toast per failed read, after its retry, not one per attempt.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error('Failed to load font families');
    }
  }, [errorUpdatedAt, isError, notificationsService]);

  const openFontFamilyModal = (
    modalId: ModalEnum,
    fontFamily?: IFontFamily,
  ) => {
    setSelectedFontFamily(fontFamily ?? null);
    openModal(modalId);
  };

  const handleDelete = async (fontFamily: IFontFamily) => {
    try {
      const service = await getFontFamiliesService();
      await service.delete(fontFamily.id);
      notificationsService.success('Font family deleted');
      setSelectedFontFamily(null);
      findAllFontFamilies();
    } catch (error) {
      logger.error('Failed to delete font family', error);
      notificationsService.error('Failed to delete font family');
      setSelectedFontFamily(null);
    }
  };

  const rowSidebar = createSummaryRowSidebar<FontFamily>({
    getFacts: (fontFamily) => [
      { id: 'key', label: fieldsT('key'), value: fontFamily.key },
      {
        id: 'description',
        label: fieldsT('description'),
        value: fontFamily.description,
      },
    ],
    getId: (fontFamily) => fontFamily.id,
    getSubtitle: (fontFamily) => fontFamily.key,
    getTitle: (fontFamily) => fontFamily.label,
    kind: 'record',
    onEdit:
      scope === PageScope.SUPERADMIN
        ? (fontFamily) => openFontFamilyModal(ModalEnum.FONT_FAMILY, fontFamily)
        : undefined,
  });

  return (
    <AdminPageShell
      title="Font Families"
      search={
        <SearchField
          ariaLabel={searchT('fontFamilies')}
          onSearch={setSearch}
          placeholder={searchT('fontFamilies')}
          value={search}
        />
      }
      onRefresh={() => findAllFontFamilies()}
      isRefreshing={isRefreshing}
      dropdowns={
        scope === PageScope.SUPERADMIN ? <AdminOrgBrandUrlFilter /> : undefined
      }
      primaryAction={
        scope === PageScope.SUPERADMIN ? (
          <Button
            label="Font Family"
            icon={<Plus />}
            variant={ButtonVariant.DEFAULT}
            onClick={() => openFontFamilyModal(ModalEnum.FONT_FAMILY)}
          />
        ) : undefined
      }
    >
      <AppTable<FontFamily>
        items={fontFamilies}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No font families found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyModalFontFamily
          item={selectedFontFamily}
          onClose={() => setSelectedFontFamily(null)}
          onConfirm={() => {
            setSelectedFontFamily(null);
            findAllFontFamilies();
          }}
        />
      )}

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel="font families"
          totals={fontFamiliesQuery.data?.totals}
        />
      </div>
    </AdminPageShell>
  );
}

export default function FontFamiliesList(
  props: Parameters<typeof FontFamiliesListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <FontFamiliesListContent {...props} />
    </Suspense>
  );
}
