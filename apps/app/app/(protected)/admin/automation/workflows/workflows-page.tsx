'use client';

import ButtonRefresh from '@components/buttons/refresh/button-refresh/ButtonRefresh';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  getSystemWorkflowMetadata,
  type IFeaturedWorkflowSummary,
} from '@genfeedai/contracts/interfaces';
import type { CollectionOverflowAction } from '@genfeedai/props/ui/collection/collection.props';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Workflow } from '@models/automation/workflow.model';
import { useConfirmDeleteModal } from '@providers/global-modals/global-modals.provider';
import { AdminFeaturedWorkflowsService } from '@services/admin/featured-workflows.service';
import { WorkflowsService } from '@services/automation/workflows.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionSection from '@ui/collection/CollectionSection';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Container from '@ui/layout/container/Container';
import ListRow from '@ui/lists/list-row/ListRow';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
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

const WORKFLOW_SKELETON_KEYS = [
  'workflow-skeleton-1',
  'workflow-skeleton-2',
  'workflow-skeleton-3',
  'workflow-skeleton-4',
] as const;

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
  const notificationsService = NotificationsService.getInstance();
  const { openConfirmDelete } = useConfirmDeleteModal();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [pins, setPins] = useState<IFeaturedWorkflowSummary[]>([]);
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
    [getWorkflowsService, loadPins, notificationsService, translate],
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

  function workflowActions(workflow: Workflow): CollectionOverflowAction[] {
    const actions: CollectionOverflowAction[] = [];
    if (pinnedIds.has(workflow.id)) {
      actions.push({
        icon: <PinOff className="size-4" />,
        id: 'unpin',
        isDisabled: isSavingPins,
        label: translate('actions.unpin'),
        onSelect: () =>
          void savePins(
            (service) => service.unpin(workflow.id),
            translate('featured.unpinned'),
          ),
      });
    } else if (isPinnable(workflow)) {
      actions.push({
        icon: <Pin className="size-4" />,
        id: 'pin',
        isDisabled: isSavingPins,
        label: translate('actions.pin'),
        onSelect: () =>
          void savePins(
            (service) => service.pin(workflow.id),
            translate('featured.pinned'),
          ),
      });
    }
    actions.push({
      icon: <Trash2 className="size-4" />,
      id: 'delete',
      isDestructive: true,
      label: translate('actions.delete'),
      onSelect: () => handleDelete(workflow),
    });
    return actions;
  }

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
    <Container
      label={translate('title')}
      description={translate('description')}
      icon={ClipboardList}
      right={
        <ButtonRefresh
          onClick={() => void loadWorkflows(true)}
          isRefreshing={isRefreshing}
        />
      }
    >
      {isLoading ? (
        <div className="grid gap-4">
          {WORKFLOW_SKELETON_KEYS.map((key) => (
            <SkeletonCard key={key} showImage={false} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
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

          <WorkspaceSurface
            title={translate('listTitle')}
            tone="muted"
            data-testid="automation-workflows-surface"
          >
            <div className="grid gap-4">
              {workflows.length === 0 ? (
                <CardEmptyContent label={translate('empty')} />
              ) : (
                workflows.map((workflow: Workflow) => (
                  <Card key={workflow.id} data-testid="admin-workflow-card">
                    <div className="flex items-start justify-between gap-4 p-6">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-3">
                          <h3 className="card-label text-sm font-semibold">
                            {workflow.label || translate('untitled')}
                          </h3>
                          <Badge
                            variant={getWorkflowStatusVariant(workflow.status)}
                          >
                            {workflow.status}
                          </Badge>
                          {workflow.trigger ? (
                            <Badge variant="outline" className="capitalize">
                              {workflow.trigger}
                            </Badge>
                          ) : null}
                          {pinnedIds.has(workflow.id) ? (
                            <Badge variant="info">
                              {translate('featured.badge')}
                            </Badge>
                          ) : null}
                        </div>

                        {workflow.description ? (
                          <p className="mb-3 text-foreground/70">
                            {workflow.description}
                          </p>
                        ) : null}

                        {workflow.createdAt ? (
                          <div className="flex items-center gap-4 text-sm text-foreground/60">
                            <span>
                              {translate('created')}{' '}
                              <ClientFormattedDate
                                format="date"
                                value={workflow.createdAt}
                              />
                            </span>
                          </div>
                        ) : null}
                      </div>

                      <CollectionItemActions
                        overflow={workflowActions(workflow)}
                        overflowLabel={translate('actions.more', {
                          label: workflow.label || translate('untitled'),
                        })}
                      />
                    </div>
                  </Card>
                ))
              )}
            </div>
          </WorkspaceSurface>
        </div>
      )}
    </Container>
  );
}
