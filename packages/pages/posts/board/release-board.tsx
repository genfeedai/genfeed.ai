'use client';

import { ButtonSize, ButtonVariant, ReleaseStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IReleaseGroup } from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import ReleaseRailRow from '@pages/posts/rail/release-rail-row';
import CalendarRepublishDialog, {
  CALENDAR_MOVE_ACTION,
  CALENDAR_REPUBLISH_ACTION,
} from '@pages/posts/shared/calendar-republish-dialog';
import {
  isReleaseDragConfirmRequired,
  isReleaseDraggable,
  releaseScheduledInstant,
} from '@pages/posts/shared/release-status.helpers';
import type {
  ReleaseBoardColumnId,
  ReleaseBoardProps,
} from '@props/publisher/release-board.props';
import type { PendingCalendarDrop } from '@props/publisher/release-calendar.props';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { CredentialsService } from '@services/organization/credentials.service';
import { ErrorFallback } from '@ui/error/ErrorFallback';
import SelectionToolbar from '@ui/lists/selection-toolbar/SelectionToolbar';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

/** Wire status → Kanban column. `review` is derived from `PAUSED` only. */
const COLUMN_STATUSES: Record<ReleaseBoardColumnId, ReleaseStatus[]> = {
  draft: [ReleaseStatus.DRAFT],
  failed: [ReleaseStatus.FAILED, ReleaseStatus.CANCELLED],
  published: [ReleaseStatus.PUBLISHED, ReleaseStatus.PARTIALLY_PUBLISHED],
  review: [ReleaseStatus.PAUSED],
  scheduled: [ReleaseStatus.SCHEDULED, ReleaseStatus.PUBLISHING],
};

const BOARD_COLUMNS: ReleaseBoardColumnId[] = [
  'draft',
  'review',
  'scheduled',
  'published',
  'failed',
];

/**
 * Columns that never accept a drop, regardless of source. Published/Failed are
 * outcome states the board cannot rewrite; `review` is the review-decision
 * queue's own state — the board must never edit review decisions itself.
 */
const REFUSED_DROP_COLUMNS = new Set<ReleaseBoardColumnId>([
  'published',
  'failed',
  'review',
  'draft',
]);

const SCHEDULE_MOVE_ACTION = 'board-schedule-move';
const SCHEDULE_NEXT_SLOT_ACTION = 'board-schedule-next-slot';
const CANCEL_ACTION = 'board-cancel';

function columnForRelease(release: IReleaseGroup): ReleaseBoardColumnId {
  return (
    BOARD_COLUMNS.find((column) =>
      COLUMN_STATUSES[column].includes(release.status),
    ) ?? 'draft'
  );
}

function mutationErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The board could not save that change.';
}

export default function ReleaseBoard({
  browserTimezone,
  isLoading,
  loadError,
  onRefetch,
  releases,
}: ReleaseBoardProps): React.JSX.Element {
  const translate = useTranslations('pages.posts.board');
  const { href } = useOrgUrl();
  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );
  const getReleaseGroupsService = useAuthedService((token: string) =>
    ReleaseGroupsService.getInstance(token),
  );
  const getCredentialsService = useAuthedService((token: string) =>
    CredentialsService.getInstance(token),
  );
  const [items, setItems] = useState<IReleaseGroup[]>(releases);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingCalendarDrop | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // `items` holds optimistic overrides from local mutations; `syncedItems`
  // merges them onto the latest `releases` prop so a parent refetch still
  // surfaces newly arrived releases without discarding an in-flight edit.
  const syncedItems = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return releases.map((release) => byId.get(release.id) ?? release);
  }, [items, releases]);

  const columns = useMemo(() => {
    const grouped = new Map<ReleaseBoardColumnId, IReleaseGroup[]>(
      BOARD_COLUMNS.map((column) => [column, []]),
    );
    for (const release of syncedItems) {
      grouped.get(columnForRelease(release))?.push(release);
    }
    return grouped;
  }, [syncedItems]);

  const runMutation = useCallback(
    async (
      action: string,
      releaseId: string,
      mutation: (service: ReleaseGroupsService) => Promise<IReleaseGroup>,
      onFailure?: () => void,
    ): Promise<void> => {
      setPendingAction(action);
      try {
        const service = await getReleaseGroupsService();
        const updated = await mutation(service);
        setItems((current) =>
          current.map((entry) => (entry.id === releaseId ? updated : entry)),
        );
      } catch (error) {
        onFailure?.();
        logger.error(
          `Failed to update release ${releaseId} from the board`,
          error,
        );
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        setPendingAction(null);
      }
    },
    [getReleaseGroupsService, notificationsService],
  );

  const handleDrop = useCallback(
    (targetColumn: ReleaseBoardColumnId) => {
      const release = syncedItems.find((entry) => entry.id === draggingId);
      setDraggingId(null);
      if (!release) {
        return;
      }

      const sourceColumn = columnForRelease(release);
      if (sourceColumn === targetColumn) {
        return;
      }

      if (REFUSED_DROP_COLUMNS.has(targetColumn)) {
        notificationsService.error(translate('dropRefused'));
        return;
      }

      if (!isReleaseDraggable(release)) {
        notificationsService.error(translate('dropBlocked'));
        return;
      }

      // Only `scheduled` remains as a valid drop target once review, published,
      // and failed are excluded above.
      const instant = releaseScheduledInstant(release);
      if (!instant) {
        notificationsService.error(translate('dropMissingSchedule'));
        return;
      }

      if (isReleaseDragConfirmRequired(release)) {
        setPendingDrop({
          release,
          revert: () => {
            /* optimistic state was never mutated before the dialog opens */
          },
          scheduledDate: instant,
        });
        return;
      }

      void runMutation(SCHEDULE_MOVE_ACTION, release.id, (service) =>
        service.update(release.id, { scheduledDate: instant }),
      );
    },
    [draggingId, notificationsService, runMutation, syncedItems, translate],
  );

  const handleCancelPendingDrop = useCallback(() => {
    setPendingDrop(null);
  }, []);

  const handleCardOnlyDrop = useCallback(() => {
    if (!pendingDrop) {
      return;
    }
    const { release, scheduledDate } = pendingDrop;
    void (async () => {
      await runMutation(CALENDAR_MOVE_ACTION, release.id, (service) =>
        service.moveCalendarPlacement(release.id, scheduledDate),
      );
      setPendingDrop(null);
    })();
  }, [pendingDrop, runMutation]);

  const handleRepublishDrop = useCallback(() => {
    if (!pendingDrop) {
      return;
    }
    const { release, scheduledDate } = pendingDrop;
    void (async () => {
      await runMutation(CALENDAR_REPUBLISH_ACTION, release.id, (service) =>
        service.republishAt(release.id, scheduledDate),
      );
      setPendingDrop(null);
    })();
  }, [pendingDrop, runMutation]);

  const toggleSelected = useCallback((releaseId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(releaseId)) {
        next.delete(releaseId);
      } else {
        next.add(releaseId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const handleScheduleNextSlot = useCallback(() => {
    const selected = syncedItems.filter((release) =>
      selectedIds.has(release.id),
    );
    void (async () => {
      setPendingAction(SCHEDULE_NEXT_SLOT_ACTION);
      const credentialsService = await getCredentialsService();
      const releaseGroupsService = await getReleaseGroupsService();
      for (const release of selected) {
        // One API call per selected release — the bulk action is a fan-out of
        // individual reschedules, not a single batched endpoint.
        const credentialId = release.targets?.[0]?.credentialId;
        if (!credentialId) {
          notificationsService.error(translate('bulk.scheduleNextSlotError'));
          continue;
        }
        try {
          const slot = await credentialsService.findNextSlot(credentialId);
          if (!slot.found || !slot.instant) {
            notificationsService.error(translate('bulk.scheduleNextSlotError'));
            continue;
          }
          const updated = await releaseGroupsService.update(release.id, {
            scheduledDate: slot.instant,
          });
          setItems((current) =>
            current.map((entry) => (entry.id === updated.id ? updated : entry)),
          );
        } catch (error) {
          logger.error('Failed to schedule release at next slot', error);
          notificationsService.error(mutationErrorMessage(error));
        }
      }
      setPendingAction(null);
      clearSelection();
    })();
  }, [
    clearSelection,
    getCredentialsService,
    getReleaseGroupsService,
    notificationsService,
    selectedIds,
    syncedItems,
    translate,
  ]);

  const handleBulkDelete = useCallback(() => {
    const selected = syncedItems.filter((release) =>
      selectedIds.has(release.id),
    );
    void (async () => {
      setPendingAction(CANCEL_ACTION);
      const service = await getReleaseGroupsService();
      for (const release of selected) {
        // No true delete exists on release groups; `cancel` is the closest
        // supported terminal action and is what the calendar/list use too.
        try {
          const updated = await service.cancel(release.id);
          setItems((current) =>
            current.map((entry) => (entry.id === updated.id ? updated : entry)),
          );
        } catch (error) {
          logger.error('Failed to cancel release from the board', error);
          notificationsService.error(mutationErrorMessage(error));
        }
      }
      setPendingAction(null);
      clearSelection();
    })();
  }, [
    clearSelection,
    getReleaseGroupsService,
    notificationsService,
    selectedIds,
    syncedItems,
  ]);

  if (isLoading && syncedItems.length === 0) {
    return <Loading isFullSize={false} />;
  }

  if (loadError && syncedItems.length === 0) {
    return (
      <ErrorFallback
        title={translate('loadError')}
        resetErrorBoundary={onRefetch}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {loadError ? (
        <ErrorFallback
          compact
          title={translate('loadError')}
          resetErrorBoundary={onRefetch}
        />
      ) : null}
      <div className="flex items-center justify-end">
        <Button
          isDisabled={isLoading}
          onClick={onRefetch}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
        >
          {translate('refresh')}
        </Button>
      </div>

      <SelectionToolbar
        count={selectedIds.size}
        label={translate('bulk.selectedCount', { count: selectedIds.size })}
        onClear={clearSelection}
        clearLabel={translate('bulk.clearSelection')}
      >
        <Button
          isDisabled={Boolean(pendingAction)}
          onClick={handleScheduleNextSlot}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        >
          {translate('bulk.scheduleNextSlot')}
        </Button>
        <Button
          isDisabled={Boolean(pendingAction)}
          onClick={handleBulkDelete}
          size={ButtonSize.SM}
          variant={ButtonVariant.DESTRUCTIVE}
        >
          {translate('bulk.delete')}
        </Button>
      </SelectionToolbar>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        {BOARD_COLUMNS.map((column) => {
          const columnReleases = columns.get(column) ?? [];
          return (
            <div
              className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-secondary/30 p-2"
              key={column}
              onDragOver={(event) => {
                if (!REFUSED_DROP_COLUMNS.has(column)) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(column);
              }}
            >
              <div className="flex items-center justify-between px-1 py-1">
                <span className="gen-label-sm text-foreground/60">
                  {translate(`columns.${column}`)}
                </span>
                <span className="text-xs text-foreground/45">
                  {columnReleases.length}
                </span>
                {column === 'review' ? (
                  <Link
                    className="text-xs text-primary underline-offset-2 hover:underline"
                    href={href(APP_ROUTES.PUBLISHING.REVIEW)}
                  >
                    {translate('columns.reviewLink')}
                  </Link>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                {columnReleases.map((release) => {
                  const draggable = isReleaseDraggable(release);
                  return (
                    <div
                      className={cn(
                        'flex items-start gap-1 rounded bg-card',
                        draggable ? 'cursor-grab' : 'cursor-not-allowed',
                      )}
                      draggable={draggable}
                      key={release.id}
                      onDragEnd={() => setDraggingId(null)}
                      onDragStart={(event) => {
                        if (!draggable) {
                          event.preventDefault();
                          return;
                        }
                        setDraggingId(release.id);
                        event.dataTransfer.setData('text/plain', release.id);
                      }}
                    >
                      <div className="pt-2 pl-1">
                        <Checkbox
                          isChecked={selectedIds.has(release.id)}
                          onCheckedChange={() => toggleSelected(release.id)}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <ReleaseRailRow
                          browserTimezone={browserTimezone}
                          isActive={false}
                          onActivate={() => toggleSelected(release.id)}
                          release={release}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <CalendarRepublishDialog
        isOpen={pendingDrop !== null}
        onCancel={handleCancelPendingDrop}
        onChooseCardOnly={handleCardOnlyDrop}
        onChooseRepublish={handleRepublishDrop}
        pendingAction={
          pendingAction === CALENDAR_MOVE_ACTION ||
          pendingAction === CALENDAR_REPUBLISH_ACTION
            ? pendingAction
            : null
        }
      />
    </div>
  );
}

export { COLUMN_STATUSES, columnForRelease, REFUSED_DROP_COLUMNS };
