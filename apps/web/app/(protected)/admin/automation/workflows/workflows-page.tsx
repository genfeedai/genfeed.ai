'use client';

import { useConfirmDeleteModal } from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ButtonSize, ButtonVariant, CardPadding } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IFeaturedWorkflowSummary } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Workflow } from '@models/automation/workflow.model';
import type {
  AdminWorkflowRow,
  AdminWorkflowType,
  AdminWorkflowTypeFilter,
} from '@props/admin/admin-workflow-row.props';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { AdminFeaturedWorkflowsService } from '@services/admin/featured-workflows.service';
import { WorkflowsService } from '@services/automation/workflows.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import CollectionSection from '@ui/collection/CollectionSection';
import AppTable from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import ListRow from '@ui/lists/list-row/ListRow';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminSearchParam } from '@/components/content/admin-filters/useAdminSearchParam';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import SearchField from '@/components/content/search-field/SearchField';
import { createWorkflowApiService } from '@/features/workflows/services/workflow-api';
import type { SystemWorkflowCatalogEntry } from '@/features/workflows/services/workflow-api.types';
import { useTableSort } from '@/hooks/ui/use-table-sort/use-table-sort';
import {
  buildWorkflowRows,
  clampPage,
  filterWorkflowRows,
  getPageCount,
  sortWorkflowRows,
  WORKFLOW_SORT_KEYS,
} from './workflow-rows';

function getWorkflowStatusVariant(
  status: string,
): 'success' | 'secondary' | 'warning' | 'info' | 'destructive' {
  switch (status) {
    case 'running':
    case 'active':
      return 'success';
    case 'draft':
      return 'secondary';
    case 'paused':
    case 'inactive':
      return 'warning';
    case 'completed':
    case 'failed':
      return 'info';
    default:
      return 'destructive';
  }
}

const WORKFLOW_TYPES: readonly AdminWorkflowType[] = ['system', 'organization'];

function parseTypeFilter(value: string | null): AdminWorkflowTypeFilter {
  return WORKFLOW_TYPES.find((type) => type === value) ?? 'all';
}

/** Moves one id a step up or down, leaving every other position as it was. */
function movePin(
  pins: readonly IFeaturedWorkflowSummary[],
  index: number,
  offset: -1 | 1,
): string[] {
  const ids = pins.map((pin) => pin.id);
  const target = index + offset;
  const moved = ids[index];
  const displaced = ids[target];
  if (moved === undefined || displaced === undefined) {
    return ids;
  }
  ids[index] = displaced;
  ids[target] = moved;
  return ids;
}

export default function WorkflowsPage() {
  const translate = useTranslations('pages.adminWorkflows');
  const getWorkflowsService = useAuthedService((token: string) =>
    WorkflowsService.getInstance(token),
  );
  const getFeaturedWorkflowsService = useAuthedService((token: string) =>
    AdminFeaturedWorkflowsService.getInstance(token),
  );
  const getCatalogService = useAuthedService(createWorkflowApiService);
  const notificationsService = NotificationsService.getInstance();
  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const typeFilter = parseTypeFilter(searchParams.get('type'));
  const { search, setSearch } = useAdminSearchParam();
  const { sortKey, sortDirection, onSortChange } = useTableSort({
    allowedKeys: WORKFLOW_SORT_KEYS,
  });
  const { openConfirmDelete } = useConfirmDeleteModal();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [pins, setPins] = useState<IFeaturedWorkflowSummary[]>([]);
  const [catalog, setCatalog] = useState<SystemWorkflowCatalogEntry[]>([]);
  const [hasCatalogLoadFailed, setHasCatalogLoadFailed] = useState(false);
  const [hasPinsLoadFailed, setHasPinsLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingPins, setIsSavingPins] = useState(false);

  const pinnedIds = useMemo(() => new Set(pins.map((pin) => pin.id)), [pins]);

  const rows = useMemo(
    () =>
      sortWorkflowRows(
        filterWorkflowRows(
          buildWorkflowRows(workflows, catalog),
          typeFilter,
          search,
        ),
        sortKey,
        sortDirection,
      ),
    [catalog, search, sortDirection, sortKey, typeFilter, workflows],
  );
  const pageCount = getPageCount(rows.length, ITEMS_PER_PAGE);
  const currentPage = clampPage(
    Number(searchParams.get('page')) || 1,
    pageCount,
  );
  const pageRows = rows.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const updateParams = useCallback(
    (change: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParamsString);
      change(params);
      const queryString = params.toString();
      replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, replace, searchParamsString],
  );

  const changeType = useCallback(
    (value: string) => {
      const type = parseTypeFilter(value);
      updateParams((params) => {
        if (type === 'all') {
          params.delete('type');
        } else {
          params.set('type', type);
        }
        params.delete('page');
      });
    },
    [updateParams],
  );

  const changePage = useCallback(
    (page: number) =>
      updateParams((params) => {
        if (page <= 1) {
          params.delete('page');
        } else {
          params.set('page', String(page));
        }
      }),
    [updateParams],
  );

  const loadPins = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const service = await getFeaturedWorkflowsService();
        const loaded = await service.list(signal);
        if (!signal?.aborted) {
          setPins(loaded);
          setHasPinsLoadFailed(false);
        }
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        logger.error('Failed to load featured workflows', error);
        setHasPinsLoadFailed(true);
      }
    },
    [getFeaturedWorkflowsService],
  );

  const loadCatalog = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const service = await getCatalogService();
        const loaded = await service.listSystemCatalog();
        if (!signal?.aborted) {
          setCatalog(loaded);
          setHasCatalogLoadFailed(false);
        }
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        logger.error('Failed to load system workflow catalog', error);
        setHasCatalogLoadFailed(true);
      }
    },
    [getCatalogService],
  );

  const loadWorkflows = useCallback(
    async (isRefresh: boolean, signal?: AbortSignal) => {
      if (!isRefresh) {
        setIsLoading(true);
      }
      setIsRefreshing(isRefresh);

      try {
        const service = await getWorkflowsService();
        // One list means one page size: every workflow is fetched and the
        // table pages through the merged rows.
        const [fetchedWorkflows] = await Promise.all([
          service.findAllPages(
            {
              includeSystem: true,
              ...(search ? { search } : {}),
            },
            signal,
          ),
          loadPins(signal),
          loadCatalog(signal),
        ]);
        if (signal?.aborted) {
          return;
        }
        setWorkflows(fetchedWorkflows);
        logger.info('Loaded workflows', { count: fetchedWorkflows.length });
      } catch (error) {
        if (signal?.aborted) {
          return;
        }
        logger.error('Failed to load workflows', error);
        notificationsService.error(translate('errors.load'));
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [
      getWorkflowsService,
      loadCatalog,
      loadPins,
      notificationsService,
      search,
      translate,
    ],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadWorkflows(false, controller.signal);
    return () => controller.abort();
  }, [loadWorkflows]);

  /**
   * Runs one Featured write. The API answers with the pins as stored; on a
   * failure (a stale order, a workflow deleted meanwhile) the list reloads
   * so the operator acts on what every organization actually sees.
   */
  const savePins = useCallback(
    async (
      write: (
        service: AdminFeaturedWorkflowsService,
      ) => Promise<IFeaturedWorkflowSummary[]>,
      successMessage: string,
    ) => {
      setIsSavingPins(true);
      try {
        const service = await getFeaturedWorkflowsService();
        setPins(await write(service));
        notificationsService.success(successMessage);
      } catch (error) {
        logger.error('Failed to update featured workflows', error);
        notificationsService.error(translate('errors.featured'));
        await loadPins();
      } finally {
        setIsSavingPins(false);
      }
    },
    [getFeaturedWorkflowsService, loadPins, notificationsService, translate],
  );

  const handleDelete = useCallback(
    (workflow: Workflow) => {
      openConfirmDelete({
        entity: {
          id: workflow.id,
          label: workflow.label || translate('untitled'),
        },
        entityName: 'workflow',
        onConfirm: async () => {
          try {
            const service = await getWorkflowsService();
            await service.delete(workflow.id);

            notificationsService.success(translate('deleted'));
            // A deleted system copy turns its template back into "Not installed".
            await loadWorkflows(true);
          } catch (error) {
            logger.error('Failed to delete workflow', error);
            notificationsService.error(translate('errors.delete'));
          }
        },
      });
    },
    [
      getWorkflowsService,
      loadWorkflows,
      notificationsService,
      openConfirmDelete,
      translate,
    ],
  );

  const workflowActions: TableAction<AdminWorkflowRow>[] = [
    {
      icon: <PinOff />,
      isDisabled: () => isSavingPins,
      isVisible: (row) => pinnedIds.has(row.id),
      onClick: (row) =>
        void savePins(
          (service) => service.unpin(row.id),
          translate('featured.unpinned'),
        ),
      tooltip: translate('actions.unpin'),
    },
    {
      icon: <Pin />,
      isDisabled: () => isSavingPins,
      // System workflows are installed per organization from the catalog; they are never featured.
      isVisible: (row) =>
        row.type === 'organization' &&
        row.workflow !== undefined &&
        !pinnedIds.has(row.id),
      onClick: (row) =>
        void savePins(
          (service) => service.pin(row.id),
          translate('featured.pinned'),
        ),
      tooltip: translate('actions.pin'),
    },
    {
      icon: <Trash2 />,
      isVisible: (row) => row.workflow !== undefined,
      onClick: (row) => {
        if (row.workflow) {
          handleDelete(row.workflow);
        }
      },
      tooltip: translate('actions.delete'),
      tone: 'destructive',
    },
  ];

  const workflowColumns: TableColumn<AdminWorkflowRow>[] = [
    {
      header: translate('columns.workflow'),
      key: 'label',
      sortable: true,
      render: (row) => (
        <span className="font-medium">
          {row.label || translate('untitled')}
        </span>
      ),
      subtext: (row) =>
        [row.family, row.description].filter(Boolean).join(' · ') || undefined,
    },
    {
      header: translate('columns.type'),
      key: 'type',
      sortable: true,
      render: (row) => (
        <Badge variant={row.type === 'system' ? 'secondary' : 'outline'}>
          {translate(`types.${row.type}`)}
        </Badge>
      ),
    },
    {
      header: translate('columns.status'),
      key: 'status',
      sortable: true,
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          {row.workflow ? (
            <Badge variant={getWorkflowStatusVariant(row.workflow.status)}>
              {row.workflow.status}
            </Badge>
          ) : row.catalogStatus ? (
            <Badge
              variant={
                row.catalogStatus === 'installed' ? 'success' : 'secondary'
              }
            >
              {translate(`catalog.status.${row.catalogStatus}`)}
            </Badge>
          ) : null}
          {pinnedIds.has(row.id) ? (
            <Badge variant="info">{translate('featured.badge')}</Badge>
          ) : null}
        </div>
      ),
    },
    {
      header: translate('columns.trigger'),
      key: 'trigger',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          {row.trigger ? <Badge variant="outline">{row.trigger}</Badge> : null}
          {row.schedule ? (
            <span className="font-mono text-sm">{row.schedule}</span>
          ) : null}
        </div>
      ),
    },
    {
      header: translate('columns.version'),
      key: 'version',
      render: (row) => (row.version === undefined ? '' : `v${row.version}`),
    },
    {
      header: translate('columns.created'),
      key: 'createdAt',
      sortable: true,
      render: (row) =>
        row.createdAt ? <TableDateCell value={row.createdAt} /> : null,
    },
  ];

  function renderPinControls(pin: IFeaturedWorkflowSummary, index: number) {
    const label = pin.label ?? translate('untitled');
    return (
      <div className="flex items-center gap-1">
        <Button
          ariaLabel={translate('actions.moveUp', { label })}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          isDisabled={isSavingPins || index === 0}
          onClick={() =>
            void savePins(
              (service) => service.reorder(movePin(pins, index, -1)),
              translate('featured.reordered'),
            )
          }
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          ariaLabel={translate('actions.moveDown', { label })}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          isDisabled={isSavingPins || index === pins.length - 1}
          onClick={() =>
            void savePins(
              (service) => service.reorder(movePin(pins, index, 1)),
              translate('featured.reordered'),
            )
          }
        >
          <ChevronDown className="size-4" />
        </Button>
        <Button
          ariaLabel={translate('actions.unpinNamed', { label })}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          isDisabled={isSavingPins}
          onClick={() =>
            void savePins(
              (service) => service.unpin(pin.id),
              translate('featured.unpinned'),
            )
          }
        >
          {translate('actions.unpin')}
        </Button>
      </div>
    );
  }

  return (
    <AdminPageShell
      title={translate('title')}
      icon={ClipboardList}
      search={
        <SearchField
          ariaLabel={translate('search')}
          onSearch={setSearch}
          placeholder={translate('search')}
          value={search}
        >
          <FilterMenu
            isAttached
            facets={[
              {
                defaultValue: 'all',
                key: 'type',
                label: translate('filters.type'),
                onChange: changeType,
                options: [
                  { label: translate('types.all'), value: 'all' },
                  ...WORKFLOW_TYPES.map((type) => ({
                    label: translate(`types.${type}`),
                    value: type,
                  })),
                ],
                selection: 'single',
                value: typeFilter,
              },
            ]}
            onClear={() => changeType('all')}
          />
        </SearchField>
      }
      onRefresh={() => void loadWorkflows(true)}
      isRefreshing={isRefreshing}
    >
      <div className="flex flex-col gap-8">
        {isLoading ? null : (
          <CollectionSection
            title={translate('featured.title')}
            description={translate('featured.description')}
            itemCount={pins.length}
            isCountVisible
            error={
              hasPinsLoadFailed ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{translate('featured.loadError')}</span>
                  <Button
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    onClick={() => void loadPins()}
                  >
                    {translate('actions.retry')}
                  </Button>
                </div>
              ) : undefined
            }
            data-testid="admin-featured-workflows"
          >
            <Card padding={CardPadding.NONE}>
              {pins.map((pin, index) => (
                <ListRow
                  key={pin.id}
                  density="compact"
                  title={pin.label ?? translate('untitled')}
                  description={pin.description ?? undefined}
                  meta={translate('featured.position', {
                    position: pin.featuredRank,
                  })}
                  trailing={renderPinControls(pin, index)}
                  data-testid="admin-featured-workflow-row"
                />
              ))}
            </Card>
          </CollectionSection>
        )}

        {hasCatalogLoadFailed && !isLoading ? (
          <Alert variant="destructive" icon={false}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <AlertDescription>
                {translate('catalog.loadError')}
              </AlertDescription>
              <Button
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.SM}
                onClick={() => void loadCatalog()}
              >
                {translate('actions.retry')}
              </Button>
            </div>
          </Alert>
        ) : null}

        <AppTable<AdminWorkflowRow>
          ariaLabel={translate('title')}
          items={pageRows}
          columns={workflowColumns}
          actions={workflowActions}
          isLoading={isLoading}
          onSortChange={onSortChange}
          sortDirection={sortDirection}
          sortKey={sortKey}
          getRowKey={(row) => row.id}
          emptyLabel={translate('empty')}
        />
        <Pagination
          currentPage={currentPage}
          totalPages={pageCount}
          totalItems={isLoading ? undefined : rows.length}
          totalLabel={translate('totalLabel')}
          onPageChange={changePage}
        />
      </div>
    </AdminPageShell>
  );
}
