'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  getSystemWorkflowMetadata,
  type IFeaturedWorkflowSummary,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Workflow } from '@models/automation/workflow.model';
import type { TableAction, TableColumn } from '@props/ui/display/table.props';
import { useConfirmDeleteModal } from '@providers/global-modals/global-modals.provider';
import { AdminFeaturedWorkflowsService } from '@services/admin/featured-workflows.service';
import { WorkflowsService } from '@services/automation/workflows.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import CollectionSection from '@ui/collection/CollectionSection';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import ListRow from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import {
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { createWorkflowApiService } from '@/features/workflows/services/workflow-api';
import type { SystemWorkflowCatalogEntry } from '@/features/workflows/services/workflow-api.types';

function getWorkflowStatusVariant(
  status: string,
): 'success' | 'ghost' | 'warning' | 'info' | 'error' {
  switch (status) {
    case 'running':
    case 'active':
      return 'success';
    case 'draft':
      return 'ghost';
    case 'paused':
    case 'inactive':
      return 'warning';
    case 'completed':
    case 'failed':
      return 'info';
    default:
      return 'error';
  }
}

/** System workflows are installed per organization from the catalog; they are never featured. */
function isPinnable(workflow: Workflow): boolean {
  return getSystemWorkflowMetadata(workflow.metadata) === null;
}

type CatalogStatus = 'installed' | 'available' | 'systemAction';

function getCatalogStatus(entry: SystemWorkflowCatalogEntry): CatalogStatus {
  if (entry.installed) {
    return 'installed';
  }
  return entry.installable ? 'available' : 'systemAction';
}

function formatFamily(family: string): string {
  return family.replaceAll('-', ' ');
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
        const [fetchedWorkflows] = await Promise.all([
          service.findAllPages({
            includeSystem: true,
            sort: 'createdAt: -1',
          }),
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

            setWorkflows((prev) => prev.filter((w) => w.id !== workflow.id));
            notificationsService.success(translate('deleted'));
          } catch (error) {
            logger.error('Failed to delete workflow', error);
            notificationsService.error(translate('errors.delete'));
          }
        },
      });
    },
    [openConfirmDelete, getWorkflowsService, notificationsService, translate],
  );

  const workflowActions: TableAction<Workflow>[] = [
    {
      icon: <PinOff />,
      isDisabled: () => isSavingPins,
      isVisible: (workflow) => pinnedIds.has(workflow.id),
      onClick: (workflow) =>
        void savePins(
          (service) => service.unpin(workflow.id),
          translate('featured.unpinned'),
        ),
      tooltip: translate('actions.unpin'),
    },
    {
      icon: <Pin />,
      isDisabled: () => isSavingPins,
      isVisible: (workflow) =>
        !pinnedIds.has(workflow.id) && isPinnable(workflow),
      onClick: (workflow) =>
        void savePins(
          (service) => service.pin(workflow.id),
          translate('featured.pinned'),
        ),
      tooltip: translate('actions.pin'),
    },
    {
      icon: <Trash2 />,
      onClick: handleDelete,
      tooltip: translate('actions.delete'),
      variant: ButtonVariant.DESTRUCTIVE,
    },
  ];

  const workflowColumns: TableColumn<Workflow>[] = [
    {
      header: translate('columns.workflow'),
      key: 'label',
      render: (workflow) => (
        <span className="font-medium">
          {workflow.label || translate('untitled')}
        </span>
      ),
      subtext: (workflow) => workflow.description || undefined,
    },
    {
      header: translate('columns.status'),
      key: 'status',
      render: (workflow) => (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getWorkflowStatusVariant(workflow.status)}>
            {workflow.status}
          </Badge>
          {pinnedIds.has(workflow.id) ? (
            <Badge variant="info">{translate('featured.badge')}</Badge>
          ) : null}
        </div>
      ),
    },
    {
      header: translate('columns.trigger'),
      key: 'trigger',
      render: (workflow) =>
        workflow.trigger ? (
          <Badge variant="outline" className="capitalize">
            {workflow.trigger}
          </Badge>
        ) : null,
    },
    {
      header: translate('columns.created'),
      key: 'createdAt',
      render: (workflow) =>
        workflow.createdAt ? (
          <ClientFormattedDate format="date" value={workflow.createdAt} />
        ) : null,
    },
  ];

  const catalogColumns: TableColumn<SystemWorkflowCatalogEntry>[] = [
    {
      header: translate('columns.workflow'),
      key: 'label',
      render: (entry) => <span className="font-medium">{entry.label}</span>,
      subtext: (entry) => entry.description || undefined,
    },
    {
      className: 'capitalize',
      header: translate('columns.family'),
      key: 'family',
      render: (entry) => formatFamily(entry.family),
    },
    {
      className: 'font-mono text-sm',
      header: translate('columns.schedule'),
      key: 'schedule',
      render: (entry) => entry.schedule ?? '',
    },
    {
      header: translate('columns.version'),
      key: 'version',
      render: (entry) => `v${entry.version}`,
    },
    {
      header: translate('columns.status'),
      key: 'installed',
      render: (entry) => {
        const status = getCatalogStatus(entry);
        return (
          <Badge variant={status === 'installed' ? 'success' : 'ghost'}>
            {translate(`catalog.status.${status}`)}
          </Badge>
        );
      },
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
            <Card bodyClassName="p-0">
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

        <AppTable<SystemWorkflowCatalogEntry>
          label={translate('catalog.title')}
          ariaLabel={translate('catalog.title')}
          description={translate('catalog.description')}
          items={catalog}
          columns={catalogColumns}
          isLoading={isLoading}
          error={
            hasCatalogLoadFailed
              ? {
                  onRetry: () => void loadCatalog(),
                  title: translate('catalog.loadError'),
                }
              : undefined
          }
          getRowKey={(entry) => entry.canonicalId}
          emptyLabel={translate('catalog.empty')}
        />

        <AppTable<Workflow>
          label={translate('listTitle')}
          ariaLabel={translate('listTitle')}
          description={translate('listDescription')}
          items={workflows}
          columns={workflowColumns}
          actions={workflowActions}
          isLoading={isLoading}
          getRowKey={(workflow) => workflow.id}
          emptyLabel={translate('empty')}
        />
      </div>
    </AdminPageShell>
  );
}
