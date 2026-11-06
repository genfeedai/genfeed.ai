import { useConfirmModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { PageScope } from '@genfeedai/contracts';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import type {
  IElementStyle,
  IQueryParams,
} from '@genfeedai/contracts/interfaces';
import type { IElementContentProps } from '@genfeedai/contracts/interfaces/ui/elements-content.interface';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePagedAuthedQuery } from '@hooks/auth/use-paged-authed-query/use-paged-authed-query';
import { useRefreshScope } from '@hooks/auth/use-refresh-scope/use-refresh-scope';
import type { ElementStyle } from '@models/elements/style.model';
import type { TableColumn } from '@props/ui/display/table.props';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { StylesService } from '@services/elements/styles.service';
import ElementScopeBadge from '@ui/display/element-scope-badge/ElementScopeBadge';
import { useElementRowSidebar } from '@ui/display/element-scope-badge/element-row-sidebar';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { Badge } from '@ui/primitives/badge';
import { Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useRef } from 'react';
import { useAdminOrgBrandParams } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import { LazyModalStyle } from '@/components/lazy/modal/LazyModal';
import { useInlineRecordSave } from '@/hooks/ui/use-inline-record-save/use-inline-record-save';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';

const EMPTY_STYLES: ElementStyle[] = [];

const STYLE_SORT_KEYS = ['label', 'key'];

function StylesListContent({
  filters,
  scope = PageScope.BRAND,
  onLoadingChange,
  onRefreshingChange,
  onRefresh,
}: IElementContentProps) {
  const notificationsService = NotificationsService.getInstance();
  const fieldsT = useTranslations('ui.rowSidebar.fields');
  const { openConfirm } = useConfirmModal();

  const getStylesService = useAuthedService(
    useCallback((token: string) => StylesService.getInstance(token), []),
  );

  const searchParams = useSearchParams();
  const { sort, sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: STYLE_SORT_KEYS,
  });

  const { brand: adminBrand, organization: adminOrg } =
    useAdminOrgBrandParams();

  // Use refs for callback props to prevent unnecessary re-renders
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onRefreshingChangeRef = useRef(onRefreshingChange);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
    onRefreshingChangeRef.current = onRefreshingChange;
  });

  const scopeTranslate = useTranslations('ui.elementPlatformFields');
  const columns: TableColumn<ElementStyle>[] = [
    {
      header: 'Label',
      key: 'label',
      sortable: true,
      subtext: (style: ElementStyle) => style.description,
    },
    {
      className: 'font-mono text-sm',
      header: 'Key',
      key: 'key',
      sortable: true,
    },
    {
      header: scopeTranslate('scopeHeader'),
      key: 'isPlatformDefault',
      render: (element: ElementStyle) => (
        <ElementScopeBadge
          isActive={element.isActive}
          isPlatformDefault={element.isPlatformDefault}
        />
      ),
    },
    {
      className: 'min-w-32 max-w-xs',
      header: 'Model',
      key: 'models',
      render: (style: IElementStyle) => (
        <div className="flex flex-wrap gap-2">
          {style.models?.map((model) => (
            <Badge casing="normal" key={model} variant="outline">
              {model}
            </Badge>
          ))}
        </div>
      ),
    },
  ];

  const actions =
    scope === PageScope.SUPERADMIN
      ? [
          {
            icon: <Trash2 />,
            onClick: (style: IElementStyle) =>
              openConfirm({
                confirmLabel: 'Delete',
                isError: true,
                label: 'Delete Style',
                message: `Are you sure you want to delete "${style.label}"? This action cannot be undone.`,
                onConfirm: () => handleDelete(style),
              }),
            tooltip: 'Delete',
          },
        ]
      : [];

  // Extract page from URL to use as dependency (triggers re-fetch when page changes)
  const currentPage = Number(searchParams.get('page')) || 1;

  // Cached per scope and page: coming back paints the rows and footer it
  // already has while they refresh, and another page, search or sort keeps
  // the current rows on screen while it loads.
  const scopeKey = [
    'admin',
    'styles',
    { adminBrand, adminOrg, scope },
  ] as const;
  const stylesQuery = usePagedAuthedQuery<StylesService, ElementStyle>({
    keepPreviousDataWithin: scopeKey,
    queryFn: async (service, signal) => {
      const query: IQueryParams = {
        limit: ITEMS_PER_PAGE,
        page: currentPage,
        search: filters?.search || undefined,
        ...(sort ? { sort } : {}),
      };

      if (scope === PageScope.SUPERADMIN) {
        if (adminOrg) {
          query.organization = adminOrg;
        }
        if (adminBrand) {
          query.brand = adminBrand;
        }
      }

      try {
        const data = await service.findAllPage(query, signal);
        logger.info('GET /styles success', data.items);
        return data;
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /styles failed', error);
        }
        throw error;
      }
    },
    queryKey: [
      ...scopeKey,
      { page: currentPage, search: filters?.search ?? '', sort: sort ?? null },
    ],
    service: (token: string) => StylesService.getInstance(token),
  });
  const styles = stylesQuery.data?.items ?? EMPTY_STYLES;
  const { errorUpdatedAt, isError, isFetching, isLoading } = stylesQuery;
  // Cancels a read that started before the change, and re-reads every
  // cached page, search and sort of this list.
  const refreshStyles = useRefreshScope(scopeKey);
  const isRefreshing = isFetching && !isLoading;

  // One toast per failed read, not one per render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: errorUpdatedAt marks each new failed read.
  useEffect(() => {
    if (isError) {
      notificationsService.error('Failed to load styles');
    }
  }, [errorUpdatedAt, isError, notificationsService]);

  useEffect(() => {
    onLoadingChangeRef.current?.(isLoading);
  }, [isLoading]);

  useEffect(() => {
    onRefreshingChangeRef.current?.(isRefreshing);
  }, [isRefreshing]);

  // Register refresh callback
  useEffect(() => {
    if (onRefresh) {
      return onRefresh(() => refreshStyles());
    }
  }, [onRefresh, refreshStyles]);

  const handleDelete = async (style: IElementStyle) => {
    try {
      const service = await getStylesService();
      await service.delete(style.id);
      notificationsService.success('Style deleted');
      void refreshStyles();
    } catch (error) {
      logger.error('Failed to delete style', error);
      notificationsService.error('Failed to delete style');
    }
  };

  const saveStyle = useInlineRecordSave<Partial<IElementStyle>>({
    errorMessage: 'Failed to update style',
    onSaved: () => {
      void refreshStyles();
    },
    save: async (id, patch) => (await getStylesService()).patch(id, patch),
  });

  const isEditable = scope === PageScope.SUPERADMIN;

  const rowSidebar = useElementRowSidebar<ElementStyle>({
    getExtraFacts: (style) => [
      {
        editor: isEditable
          ? {
              ariaLabel: fieldsT('models'),
              kind: 'multiselect',
              onSave: (models) => saveStyle(style.id, { models }),
              options: Object.values(MODEL_KEYS).map((model) => ({
                label: model,
                value: model,
              })),
              placeholder: '-',
              values: style.models,
            }
          : undefined,
        id: 'models',
        label: fieldsT('models'),
        value: style.models?.join(', '),
      },
    ],
    onSave: isEditable
      ? (element, patch) => saveStyle(element.id, patch)
      : undefined,
  });

  return (
    <>
      <AppTable<ElementStyle>
        onSortChange={onSortChange}
        sortDirection={sortDirection}
        sortKey={sortKey}
        items={styles}
        columns={columns}
        actions={actions}
        isLoading={isLoading}
        getRowKey={(item) => item.id}
        rowSidebar={rowSidebar}
        emptyLabel="No styles found"
      />

      {scope === PageScope.SUPERADMIN && (
        <LazyModalStyle onConfirm={() => refreshStyles()} />
      )}

      <div className="mt-4">
        <AutoPagination
          showTotal
          totalLabel="styles"
          totals={stylesQuery.data?.totals ?? EMPTY_PAGE_TOTALS}
        />
      </div>
    </>
  );
}

export default function StylesList(
  props: Parameters<typeof StylesListContent>[0],
) {
  return (
    <Suspense fallback={null}>
      <StylesListContent {...props} />
    </Suspense>
  );
}
