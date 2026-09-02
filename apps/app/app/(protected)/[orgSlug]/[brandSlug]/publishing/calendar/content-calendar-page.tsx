'use client';

import { normalizePostingTimes } from '@api-types/contracts/credential-posting-times.contract';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { APP_ROUTES, createArtifactEditorRoute } from '@genfeedai/constants';
import {
  ButtonSize,
  ButtonVariant,
  CalendarSlotState,
  formatPlatformLabel,
  PostCategory,
  PostRepurposeMode,
  parsePlatform,
  TargetExecutionState,
} from '@genfeedai/enums';
import type {
  IArticle,
  ICalendarSlot,
  IPostingCadence,
  IReleaseGroup,
} from '@genfeedai/interfaces';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { getPublishingPostsHref } from '@helpers/content/posts.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useCalendarWeekRange } from '@hooks/utils/use-calendar-week-range/use-calendar-week-range';
import CalendarRepublishDialog, {
  CALENDAR_MOVE_ACTION,
  CALENDAR_REPUBLISH_ACTION,
} from '@pages/posts/shared/calendar-republish-dialog';
import {
  isReleaseDragConfirmRequired,
  isReleaseDraggable,
  releaseScheduledInstant,
  releaseStatusBadge,
  releaseTargets,
} from '@pages/posts/shared/release-status.helpers';
import type {
  CalendarEventAction,
  CalendarEventBadge,
  CalendarEventChannel,
  CalendarEventDrop,
  CalendarItem,
  CalendarViewKey,
} from '@props/components/calendar.props';
import type {
  PendingCalendarDrop,
  ReleaseCalendarFilterOption,
  ReleaseCalendarFilters as ReleaseFilters,
} from '@props/publisher/release-calendar.props';
import {
  useConfirmModal,
  usePostRepurposeModal,
} from '@providers/global-modals/global-modals.provider';
import { ArticlesService } from '@services/content/articles.service';
import { PostingCadencesService } from '@services/content/posting-cadences.service';
import { PostsService } from '@services/content/posts.service';
import type { ReleaseGroupListQuery } from '@services/content/release-groups.service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import ContentCalendar from '@ui/calendar/content-calendar/ContentCalendar';
import { EmptyState } from '@ui/feedback';
import { Button } from '@ui/primitives/button';
import { Calendar, FileText, List, Repeat } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const WRITE_ARTICLE_AGENT_HREF = buildAgentPromptHref(
  'Help me write a new long-form article for my brand.',
);
const CREATE_POST_AGENT_HREF = buildAgentPromptHref(
  'Help me draft a new post for my brand.',
);

import CadenceFormSheet from './cadence-form-sheet';
import {
  aggregateCalendarItemsByDay,
  isMissingCalendarSlot,
  isUnfilledCalendarSlot,
} from './calendar-day-aggregate';
import {
  CALENDAR_SLOT_EVENT_COLOR,
  getContentCalendarEventColor,
} from './calendar-item-color.helper';
import CalendarSlotDrawer from './calendar-slot-drawer';
import EvergreenSeriesControls from './evergreen-series-controls';
import ReleaseCalendarFilters, {
  EMPTY_RELEASE_CALENDAR_FILTERS,
} from './release-calendar-filters';
import ReleaseDetailDrawer, {
  RELEASE_RESCHEDULE_ACTION,
  targetRescheduleAction,
  targetRetryAction,
} from './release-detail-drawer';

interface ArticleContentCalendarItem extends CalendarItem {
  article: IArticle;
  itemType: 'article';
}

interface ReleaseContentCalendarItem extends CalendarItem {
  itemType: 'release';
  release: IReleaseGroup;
}

interface SlotContentCalendarItem extends CalendarItem {
  itemType: 'slot';
  slot: ICalendarSlot;
}

interface DayAggregateContentCalendarItem extends CalendarItem {
  filledCount: number;
  itemType: 'day-aggregate';
  missingCount: number;
  missingIdentityKeys: string[];
}

type ContentCalendarItem =
  | ArticleContentCalendarItem
  | DayAggregateContentCalendarItem
  | ReleaseContentCalendarItem
  | SlotContentCalendarItem;

function mutationErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The schedule change could not be saved.';
}

export default function ContentCalendarPage(): React.JSX.Element {
  const { brandId, credentials, selectedBrand } = useBrand();
  const { push } = useRouter();
  const { href } = useOrgUrl();
  const translate = useTranslations('pages.publishing.calendar');
  const { openConfirm } = useConfirmModal();

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getArticlesService = useAuthedService((token: string) =>
    ArticlesService.getInstance(token),
  );

  const getReleaseGroupsService = useAuthedService((token: string) =>
    ReleaseGroupsService.getInstance(token),
  );

  const getPostingCadencesService = useAuthedService((token: string) =>
    PostingCadencesService.getInstance(token),
  );

  const getPostsService = useAuthedService((token: string) =>
    PostsService.getInstance(token),
  );

  const { openPostRepurposeModal } = usePostRepurposeModal();

  const [articles, setArticles] = useState<IArticle[]>([]);
  const [releases, setReleases] = useState<IReleaseGroup[]>([]);
  const [slots, setSlots] = useState<ICalendarSlot[]>([]);
  const [cadences, setCadences] = useState<IPostingCadence[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<ICalendarSlot | null>(null);
  const [editingCadence, setEditingCadence] = useState<IPostingCadence | null>(
    null,
  );
  const [isCadenceFormOpen, setIsCadenceFormOpen] = useState(false);
  const [isSlotPending, setIsSlotPending] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
    null,
  );
  const [filters, setFilters] = useState<ReleaseFilters>(
    EMPTY_RELEASE_CALENDAR_FILTERS,
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<PendingCalendarDrop | null>(
    null,
  );
  const pendingDropRef = useRef<PendingCalendarDrop | null>(null);
  pendingDropRef.current = pendingDrop;
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [calendarView, setCalendarView] = useState<CalendarViewKey>('week');
  const [isBulkPending, setIsBulkPending] = useState(false);
  const bulkAbortRef = useRef<AbortController | null>(null);
  const [dateRange, setDateRange] = useCalendarWeekRange();

  useEffect(() => {
    return () => {
      bulkAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!dateRange) {
      return;
    }

    const controller = new AbortController();

    const loadContent = async () => {
      setIsLoading(true);

      try {
        const [articlesService, releaseGroupsService, cadencesService] =
          await Promise.all([
            getArticlesService(),
            getReleaseGroupsService(),
            getPostingCadencesService(),
          ]);

        const window = {
          endDate: dateRange.end.toISOString(),
          startDate: dateRange.start.toISOString(),
        };

        // Empty facets are omitted rather than sent as empty arrays: the DTO
        // treats a present-but-empty filter as "match nothing".
        const releasesQuery: ReleaseGroupListQuery = {
          ...window,
          ...(brandId ? { brandId } : {}),
          ...(filters.credentialId.length
            ? { credentialId: filters.credentialId }
            : {}),
          ...(filters.executionState.length
            ? { executionState: filters.executionState }
            : {}),
          ...(filters.platform.length ? { platform: filters.platform } : {}),
          ...(filters.source.length ? { source: filters.source } : {}),
          ...(filters.status.length ? { status: filters.status } : {}),
        };

        const [
          fetchedArticles,
          fetchedReleases,
          fetchedSlots,
          fetchedCadences,
        ] = await Promise.all([
          articlesService.findAll(window),
          releaseGroupsService.findAll(releasesQuery, controller.signal),
          brandId
            ? cadencesService.listSlots(
                {
                  brandId,
                  endDate: window.endDate,
                  startDate: window.startDate,
                },
                controller.signal,
              )
            : Promise.resolve([]),
          brandId
            ? cadencesService.list(brandId, controller.signal)
            : Promise.resolve([]),
        ]);

        if (controller.signal.aborted) {
          return;
        }

        setArticles(fetchedArticles);
        setReleases(fetchedReleases);
        setSlots(fetchedSlots);
        setCadences(fetchedCadences);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to load calendar content', error);
        notificationsService.error('Failed to load calendar content');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void loadContent();

    return () => controller.abort();
  }, [
    dateRange,
    brandId,
    filters,
    getArticlesService,
    getPostingCadencesService,
    getReleaseGroupsService,
    notificationsService,
  ]);

  const calendarItems: ContentCalendarItem[] = useMemo(() => {
    const articleItems: ArticleContentCalendarItem[] = articles.map(
      (article) => ({
        article,
        id: article.id,
        itemType: 'article',
        scheduledDate: article.createdAt,
        status: article.status,
        title: article.label,
      }),
    );

    const releaseItems: ReleaseContentCalendarItem[] = releases.map(
      (release) => ({
        id: release.id,
        itemType: 'release',
        release,
        scheduledDate: releaseScheduledInstant(release),
        status: release.status,
        title: release.title,
      }),
    );

    const slotItems: SlotContentCalendarItem[] = slots.map((slot) => ({
      id: slot.identityKey,
      itemType: 'slot',
      scheduledDate: slot.instant,
      slot,
      status: slot.state,
      title: slot.format,
    }));

    if (calendarView !== 'month') {
      return [...releaseItems, ...articleItems, ...slotItems];
    }

    const aggregates = aggregateCalendarItemsByDay([
      ...releaseItems.map((item) => ({
        instant: String(item.scheduledDate ?? ''),
        kind: 'filled' as const,
      })),
      ...articleItems.map((item) => ({
        instant: String(item.scheduledDate ?? ''),
        kind: 'filled' as const,
      })),
      ...slotItems
        .filter((item) => isUnfilledCalendarSlot(item.slot))
        .map((item) => ({
          identityKey: isMissingCalendarSlot(item.slot)
            ? item.slot.identityKey
            : undefined,
          instant: item.slot.instant,
          kind: 'missing' as const,
        })),
    ]);

    return aggregates.map(
      (aggregate): DayAggregateContentCalendarItem => ({
        filledCount: aggregate.filledCount,
        id: `day:${aggregate.dayKey}`,
        itemType: 'day-aggregate',
        missingCount: aggregate.missingCount,
        missingIdentityKeys: aggregate.missingIdentityKeys,
        scheduledDate: aggregate.instant,
        status: 'aggregate',
        title: translate('monthDaySummary', {
          filled: aggregate.filledCount,
          missing: aggregate.missingCount,
        }),
      }),
    );
  }, [articles, calendarView, releases, slots, translate]);

  const selectedRelease = useMemo(
    () => releases.find((release) => release.id === selectedReleaseId) ?? null,
    [releases, selectedReleaseId],
  );

  const credentialOptions: ReleaseCalendarFilterOption[] = useMemo(
    () =>
      credentials.map((credential) => ({
        label:
          credential.label ||
          credential.externalName ||
          credential.externalHandle ||
          (formatPlatformLabel(credential.platform) ?? credential.platform),
        value: credential.id,
      })),
    [credentials],
  );

  const preferredTimes = useMemo(() => {
    const visibleCredentials = filters.credentialId.length
      ? credentials.filter((credential) =>
          filters.credentialId.includes(credential.id),
        )
      : credentials;
    return normalizePostingTimes(
      visibleCredentials.flatMap((credential) => credential.postingTimes ?? []),
    );
  }, [credentials, filters.credentialId]);

  const timezone =
    selectedBrand?.agentConfig?.schedule?.timezone?.trim() || 'UTC';

  const platformOptions: ReleaseCalendarFilterOption[] = useMemo(() => {
    const seen = new Map<string, ReleaseCalendarFilterOption>();
    for (const credential of credentials) {
      if (!seen.has(credential.platform)) {
        seen.set(credential.platform, {
          label:
            formatPlatformLabel(credential.platform) ?? credential.platform,
          value: credential.platform,
        });
      }
    }

    return [...seen.values()];
  }, [credentials]);

  /**
   * Every schedule mutation shares one path: apply the server's response, or
   * undo whatever the UI already showed and surface the failure. `revert` is the
   * calendar's own undo for a drag; state mutations restore the prior list.
   */
  const runMutation = useCallback(
    async (
      action: string,
      mutation: (service: ReleaseGroupsService) => Promise<IReleaseGroup>,
      onFailure?: () => void,
    ): Promise<void> => {
      setPendingAction(action);
      setDrawerError(null);

      try {
        const service = await getReleaseGroupsService();
        const updated = await mutation(service);
        setReleases((current) => {
          const exists = current.some((release) => release.id === updated.id);
          if (exists) {
            return current.map((release) =>
              release.id === updated.id ? updated : release,
            );
          }
          return [...current, updated];
        });
      } catch (error) {
        onFailure?.();
        const message = mutationErrorMessage(error);
        logger.error('Failed to update release schedule', error);
        setDrawerError(message);
        notificationsService.error(message);
      } finally {
        setPendingAction(null);
      }
    },
    [getReleaseGroupsService, notificationsService],
  );

  const missingIdentityKeys = useMemo(
    () =>
      slots
        .filter((slot) => isMissingCalendarSlot(slot))
        .map((slot) => slot.identityKey),
    [slots],
  );

  const isAbortError = useCallback((error: unknown): boolean => {
    return (
      (error instanceof Error && error.name === 'CanceledError') ||
      (typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ERR_CANCELED')
    );
  }, []);

  const runBulkGenerate = useCallback(
    async (identityKeys: string[]): Promise<void> => {
      if (identityKeys.length === 0) {
        return;
      }

      bulkAbortRef.current?.abort();
      const abort = new AbortController();
      bulkAbortRef.current = abort;
      setIsBulkPending(true);

      try {
        const service = await getPostingCadencesService();
        const result = await service.generateBulk(
          {
            confirmedCount: identityKeys.length,
            identityKeys,
          },
          abort.signal,
        );
        const completedKeys = new Set(
          result.completed.map((slot) => slot.identityKey),
        );
        setSlots((current) =>
          current.filter((slot) => !completedKeys.has(slot.identityKey)),
        );
        setSelectedSlot((current) =>
          current && completedKeys.has(current.identityKey) ? null : current,
        );

        if (result.isCreditsExhausted) {
          notificationsService.error(
            translate('bulkGenerateCreditsStop', {
              completed: result.completedCount,
              remaining: result.remainingCount,
              total: identityKeys.length,
            }),
          );
          return;
        }

        if (result.isCancelled) {
          return;
        }

        if (result.remainingCount > 0) {
          notificationsService.success(
            translate('bulkGeneratePartial', {
              completed: result.completedCount,
              remaining: result.remainingCount,
              total: identityKeys.length,
            }),
          );
          return;
        }

        notificationsService.success(
          translate('bulkGenerateSuccess', { count: result.completedCount }),
        );
      } catch (error) {
        if (abort.signal.aborted || isAbortError(error)) {
          return;
        }
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        if (bulkAbortRef.current === abort) {
          bulkAbortRef.current = null;
        }
        setIsBulkPending(false);
      }
    },
    [getPostingCadencesService, isAbortError, notificationsService, translate],
  );

  const confirmBulkGenerate = useCallback(
    (identityKeys: string[]): void => {
      if (identityKeys.length === 0 || isBulkPending) {
        return;
      }

      openConfirm({
        confirmLabel: translate('bulkGenerateConfirm', {
          count: identityKeys.length,
        }),
        label: translate('bulkGenerateConfirmTitle', {
          count: identityKeys.length,
        }),
        message: translate('bulkGenerateConfirmMessage', {
          count: identityKeys.length,
        }),
        onConfirm: () => {
          void runBulkGenerate(identityKeys);
        },
      });
    },
    [isBulkPending, openConfirm, runBulkGenerate, translate],
  );

  const handleEventClick = useCallback(
    (item: ContentCalendarItem) => {
      if (item.itemType === 'day-aggregate') {
        if (item.missingIdentityKeys.length > 0) {
          confirmBulkGenerate(item.missingIdentityKeys);
        }
        return;
      }

      if (item.itemType === 'slot') {
        setSelectedSlot(item.slot);
        return;
      }

      if (item.itemType === 'article') {
        // Refinement belongs to the artifact — open the article's editor page.
        push(href(createArtifactEditorRoute('article', item.article.id)));
        return;
      }

      setDrawerError(null);
      setSelectedReleaseId(item.release.id);
    },
    [confirmBulkGenerate, href, push],
  );

  const handleDatesChange = useCallback(
    (start: Date, end: Date) => {
      setDateRange({ end, start });
    },
    [setDateRange],
  );

  const getEventColor = useCallback((item: ContentCalendarItem) => {
    if (item.itemType === 'day-aggregate') {
      return CALENDAR_SLOT_EVENT_COLOR;
    }

    return getContentCalendarEventColor(item);
  }, []);

  const getEventBadge = useCallback(
    (item: ContentCalendarItem): CalendarEventBadge | null => {
      if (item.itemType === 'release') {
        return releaseStatusBadge(item.release);
      }
      if (item.itemType === 'day-aggregate') {
        return {
          label: translate('monthDaySummary', {
            filled: item.filledCount,
            missing: item.missingCount,
          }),
          tone: 'muted',
        };
      }
      if (item.itemType !== 'slot') {
        return null;
      }
      return {
        label:
          item.slot.state === CalendarSlotState.GENERATE_FAILED
            ? 'failed'
            : item.slot.state === CalendarSlotState.GENERATING
              ? 'generating'
              : 'missing',
        tone:
          item.slot.state === CalendarSlotState.GENERATE_FAILED
            ? 'danger'
            : item.slot.state === CalendarSlotState.GENERATING
              ? 'warning'
              : 'muted',
      };
    },
    [translate],
  );

  const generateSlotByIdentity = useCallback(
    async (identityKey: string, brief?: string): Promise<void> => {
      setIsSlotPending(true);
      try {
        const service = await getPostingCadencesService();
        const filled = await service.generate({ brief, identityKey });
        setSlots((current) =>
          current.filter((slot) => slot.identityKey !== filled.identityKey),
        );
        setSelectedSlot((current) =>
          current?.identityKey === filled.identityKey ? null : current,
        );
        notificationsService.success('Slot generated.');
      } catch (error) {
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        setIsSlotPending(false);
      }
    },
    [getPostingCadencesService, notificationsService],
  );

  const getEventActions = useCallback(
    (item: ContentCalendarItem): CalendarEventAction[] => {
      if (
        item.itemType !== 'slot' ||
        item.slot.state !== CalendarSlotState.MISSING
      ) {
        return [];
      }
      return [
        {
          id: 'generate',
          label: translate('generate'),
          onClick: () => {
            void generateSlotByIdentity(item.slot.identityKey);
          },
        },
      ];
    },
    [generateSlotByIdentity, translate],
  );

  /**
   * One icon per distinct platform: a release with two Instagram accounts still
   * reads as one Instagram destination on a dense week cell.
   */
  const getEventChannels = useCallback(
    (item: ContentCalendarItem): CalendarEventChannel[] => {
      if (item.itemType !== 'release') {
        return [];
      }

      const seen = new Map<string, CalendarEventChannel>();
      for (const target of releaseTargets(item.release)) {
        const platformId = parsePlatform(target.platform) ?? target.platform;
        if (!seen.has(platformId)) {
          seen.set(platformId, {
            id: platformId,
            label: formatPlatformLabel(target.platform) ?? target.platform,
          });
        }
      }

      return [...seen.values()];
    },
    [],
  );

  const isItemDraggable = useCallback(
    (item: ContentCalendarItem): boolean =>
      item.itemType === 'release' && isReleaseDraggable(item.release),
    [],
  );

  const handleEventDrop = useCallback(
    (change: CalendarEventDrop<ContentCalendarItem>) => {
      if (change.item.itemType !== 'release') {
        change.revert();
        return;
      }

      if (pendingDropRef.current) {
        change.revert();
        return;
      }

      if (!Number.isFinite(change.start.getTime())) {
        change.revert();
        notificationsService.error('That drop time is not a valid schedule.');
        return;
      }

      const { release } = change.item;
      const scheduledDate = change.start.toISOString();

      if (isReleaseDragConfirmRequired(release)) {
        setPendingDrop({
          release,
          revert: change.revert,
          scheduledDate,
        });
        return;
      }

      const previous = releases;

      // Optimistic: the event is already in its new slot, so the list has to
      // agree before the request resolves or the drawer contradicts the grid.
      setReleases((current) =>
        current.map((entry) =>
          entry.id === release.id
            ? { ...entry, scheduledAt: scheduledDate }
            : entry,
        ),
      );

      void runMutation(
        RELEASE_RESCHEDULE_ACTION,
        (service) => service.update(release.id, { scheduledDate }),
        () => {
          change.revert();
          setReleases(previous);
        },
      );
    },
    [notificationsService, releases, runMutation],
  );

  const clearPendingDrop = useCallback((shouldRevert: boolean) => {
    setPendingDrop((current) => {
      if (shouldRevert) {
        current?.revert();
      }
      return null;
    });
  }, []);

  const handleCancelPendingDrop = useCallback(() => {
    clearPendingDrop(true);
  }, [clearPendingDrop]);

  const handleCardOnlyDrop = useCallback(() => {
    if (!pendingDrop) {
      return;
    }

    const { release, revert, scheduledDate } = pendingDrop;
    const previous = releases;

    void (async () => {
      await runMutation(
        CALENDAR_MOVE_ACTION,
        (service) => service.moveCalendarPlacement(release.id, scheduledDate),
        () => {
          revert();
          setReleases(previous);
        },
      );
      setPendingDrop(null);
    })();
  }, [pendingDrop, releases, runMutation]);

  const handleRepublishDrop = useCallback(() => {
    if (!pendingDrop) {
      return;
    }

    const { release, revert, scheduledDate } = pendingDrop;
    const previous = releases;

    void (async () => {
      await runMutation(
        CALENDAR_REPUBLISH_ACTION,
        (service) => service.republishAt(release.id, scheduledDate),
        () => {
          revert();
          setReleases(previous);
        },
      );
      setPendingDrop(null);
    })();
  }, [pendingDrop, releases, runMutation]);

  const handleRescheduleRelease = useCallback(
    (scheduledDate: string) => {
      if (!selectedReleaseId) {
        return;
      }

      void runMutation(RELEASE_RESCHEDULE_ACTION, (service) =>
        service.update(selectedReleaseId, { scheduledDate }),
      );
    },
    [runMutation, selectedReleaseId],
  );

  const handleRescheduleTarget = useCallback(
    (targetId: string, scheduledDate: string) => {
      if (!selectedReleaseId) {
        return;
      }

      void runMutation(targetRescheduleAction(targetId), (service) =>
        service.updateTarget(selectedReleaseId, targetId, { scheduledDate }),
      );
    },
    [runMutation, selectedReleaseId],
  );

  /**
   * A manual retry is expressed as moving a failed target back to `scheduled`.
   * The API turns that transition into a fresh publish attempt — there is no
   * separate retry endpoint to call.
   */
  /**
   * "Add channel → adapt content" (#2588): repurpose the release's first
   * channel target into a draft target for another platform. Deterministic
   * mode keeps the drawer open on the refreshed release; agent mode navigates
   * to the review queue where the rewritten draft lands.
   */
  const handleAddChannel = useCallback(() => {
    const sourceTarget = releaseTargets(selectedRelease)[0];
    if (!selectedRelease || !sourceTarget) {
      return;
    }

    openPostRepurposeModal(
      {
        id: sourceTarget.id,
        label: selectedRelease.title,
        platform: sourceTarget.platform,
      },
      async (platform, mode) => {
        try {
          const postsService = await getPostsService();
          const draft = await postsService.repurpose(sourceTarget.id, {
            mode,
            platform,
          });

          if (mode === PostRepurposeMode.AGENT) {
            notificationsService.success(
              'Rewritten draft sent to the review queue',
            );
            push(
              href(
                draft.reviewBatchId
                  ? `/publishing/review?batch=${draft.reviewBatchId}&filter=ready`
                  : '/publishing/review',
              ),
            );
            return;
          }

          notificationsService.success(
            `Draft target added for ${formatPlatformLabel(platform) ?? platform}`,
          );
          const releaseGroupsService = await getReleaseGroupsService();
          const updated = await releaseGroupsService.getOne(selectedRelease.id);
          setReleases((current) =>
            current.map((release) =>
              release.id === updated.id ? updated : release,
            ),
          );
        } catch (error) {
          const message = mutationErrorMessage(error);
          logger.error('Failed to repurpose release target', error);
          notificationsService.error(message);
          throw error;
        }
      },
    );
  }, [
    selectedRelease,
    openPostRepurposeModal,
    getPostsService,
    getReleaseGroupsService,
    notificationsService,
    push,
    href,
  ]);

  const defaultCredentialId = credentials[0]?.id ?? '';

  const handleDateClick = useCallback(
    (start: Date) => {
      if (!brandId || !defaultCredentialId) {
        notificationsService.error('Connect a channel before booking a slot.');
        return;
      }

      void (async () => {
        try {
          const service = await getPostingCadencesService();
          const booked = await service.book({
            brandId,
            credentialId: defaultCredentialId,
            format: PostCategory.POST,
            instant: start.toISOString(),
          });
          setSlots((current) => [...current, booked]);
          setSelectedSlot(booked);
        } catch (error) {
          notificationsService.error(mutationErrorMessage(error));
        }
      })();
    },
    [
      brandId,
      defaultCredentialId,
      getPostingCadencesService,
      notificationsService,
    ],
  );

  const handleGenerateSlot = useCallback(
    (brief?: string) => {
      if (!selectedSlot) {
        return;
      }
      void generateSlotByIdentity(selectedSlot.identityKey, brief);
    },
    [generateSlotByIdentity, selectedSlot],
  );

  const handleWriteSlot = useCallback(() => {
    if (!selectedSlot) {
      return;
    }
    const format = selectedSlot.format;
    setIsSlotPending(true);
    void (async () => {
      try {
        const service = await getPostingCadencesService();
        const filled = await service.write(selectedSlot.identityKey);
        setSlots((current) =>
          current.filter((slot) => slot.identityKey !== filled.identityKey),
        );
        setSelectedSlot(null);
        if (filled.generatedItemId) {
          const kind = format === PostCategory.ARTICLE ? 'article' : 'post';
          push(href(createArtifactEditorRoute(kind, filled.generatedItemId)));
        }
      } catch (error) {
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        setIsSlotPending(false);
      }
    })();
  }, [
    getPostingCadencesService,
    href,
    notificationsService,
    push,
    selectedSlot,
  ]);

  const handleSkipSlot = useCallback(() => {
    if (!selectedSlot) {
      return;
    }
    setIsSlotPending(true);
    void (async () => {
      try {
        const service = await getPostingCadencesService();
        const skipped = await service.skip(selectedSlot.identityKey);
        setSlots((current) =>
          current.filter((slot) => slot.identityKey !== skipped.identityKey),
        );
        setSelectedSlot(null);
        notificationsService.success('Slot skipped.');
      } catch (error) {
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        setIsSlotPending(false);
      }
    })();
  }, [getPostingCadencesService, notificationsService, selectedSlot]);

  const handleCancelSlot = useCallback(() => {
    if (!selectedSlot) {
      return;
    }
    setIsSlotPending(true);
    void (async () => {
      try {
        const service = await getPostingCadencesService();
        const cancelled = await service.cancel(selectedSlot.identityKey);
        setSlots((current) =>
          current.map((slot) =>
            slot.identityKey === cancelled.identityKey ? cancelled : slot,
          ),
        );
        setSelectedSlot(null);
        notificationsService.success('Generation cancelled.');
      } catch (error) {
        notificationsService.error(mutationErrorMessage(error));
      } finally {
        setIsSlotPending(false);
      }
    })();
  }, [getPostingCadencesService, notificationsService, selectedSlot]);

  const handleCloseSlot = useCallback(() => {
    setSelectedSlot(null);
  }, []);

  const handleEditCadence = useCallback(() => {
    if (!selectedSlot?.cadenceId) {
      return;
    }
    const cadence = cadences.find(
      (entry) => entry.id === selectedSlot.cadenceId,
    );
    if (!cadence) {
      notificationsService.error('That cadence could not be loaded.');
      return;
    }
    setEditingCadence(cadence);
    setSelectedSlot(null);
    setIsCadenceFormOpen(true);
  }, [cadences, notificationsService, selectedSlot]);

  const refreshSlots = useCallback(async () => {
    if (!dateRange || !brandId) {
      return;
    }
    const service = await getPostingCadencesService();
    const [nextSlots, nextCadences] = await Promise.all([
      service.listSlots({
        brandId,
        endDate: dateRange.end.toISOString(),
        startDate: dateRange.start.toISOString(),
      }),
      service.list(brandId),
    ]);
    setSlots(nextSlots);
    setCadences(nextCadences);
  }, [brandId, dateRange, getPostingCadencesService]);

  const handleRetryTarget = useCallback(
    (targetId: string) => {
      if (!selectedReleaseId) {
        return;
      }

      void runMutation(targetRetryAction(targetId), (service) =>
        service.updateTarget(selectedReleaseId, targetId, {
          executionState: TargetExecutionState.SCHEDULED,
        }),
      );
    },
    [runMutation, selectedReleaseId],
  );

  const filterControls = (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        aria-label="New cadence"
        isDisabled={!defaultCredentialId}
        onClick={() => {
          setEditingCadence(null);
          setIsCadenceFormOpen(true);
        }}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
      >
        <Repeat className="size-4" />
        Cadence
      </Button>
      {missingIdentityKeys.length > 0 ? (
        <Button
          aria-label={translate('bulkGenerate', {
            count: missingIdentityKeys.length,
          })}
          isDisabled={isBulkPending}
          onClick={() => confirmBulkGenerate(missingIdentityKeys)}
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
        >
          {translate('bulkGenerate', { count: missingIdentityKeys.length })}
        </Button>
      ) : null}
      {isBulkPending ? (
        <Button
          onClick={() => bulkAbortRef.current?.abort()}
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
        >
          {translate('cancelBulk')}
        </Button>
      ) : null}
      <ReleaseCalendarFilters
        credentialOptions={credentialOptions}
        filters={filters}
        onChange={setFilters}
        platformOptions={platformOptions}
      />
      <Link
        href={href(getPublishingPostsHref())}
        aria-label="Open the list view"
        className="inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 size-9 transition-colors"
      >
        <List />
      </Link>
      <Link
        href={href(WRITE_ARTICLE_AGENT_HREF)}
        aria-label="Write an article"
        className="inline-flex items-center justify-center bg-secondary text-secondary-foreground hover:bg-secondary/80 size-9 transition-colors"
      >
        <FileText />
      </Link>
    </div>
  );

  const modal = (
    <>
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
      <ReleaseDetailDrawer
        error={drawerError}
        onAddChannel={handleAddChannel}
        onClose={() => setSelectedReleaseId(null)}
        onRescheduleRelease={handleRescheduleRelease}
        onRescheduleTarget={handleRescheduleTarget}
        onRetryTarget={handleRetryTarget}
        pendingAction={pendingAction}
        reconnectHref={href(APP_ROUTES.SETTINGS.SOCIAL)}
        release={selectedRelease}
      />
      {selectedRelease ? (
        <EvergreenSeriesControls groupId={selectedRelease.id} />
      ) : null}
      <CalendarSlotDrawer
        isPending={isSlotPending}
        onCancel={handleCancelSlot}
        onClose={handleCloseSlot}
        onEditCadence={selectedSlot?.cadenceId ? handleEditCadence : undefined}
        onGenerate={handleGenerateSlot}
        onSkip={handleSkipSlot}
        onWrite={handleWriteSlot}
        slot={selectedSlot}
      />
      <CadenceFormSheet
        brandId={brandId}
        cadence={editingCadence}
        credentialId={defaultCredentialId}
        isOpen={isCadenceFormOpen}
        isPending={isSlotPending}
        onClose={() => {
          setIsCadenceFormOpen(false);
          setEditingCadence(null);
        }}
        onDelete={
          editingCadence
            ? () => {
                const cadenceId = editingCadence.id;
                setIsSlotPending(true);
                void (async () => {
                  try {
                    const service = await getPostingCadencesService();
                    await service.delete(cadenceId);
                    setIsCadenceFormOpen(false);
                    setEditingCadence(null);
                    notificationsService.success('Cadence deleted.');
                    await refreshSlots();
                  } catch (error) {
                    notificationsService.error(mutationErrorMessage(error));
                  } finally {
                    setIsSlotPending(false);
                  }
                })();
              }
            : undefined
        }
        onSubmit={(input) => {
          setIsSlotPending(true);
          void (async () => {
            try {
              const service = await getPostingCadencesService();
              if (editingCadence) {
                await service.update(editingCadence.id, input);
              } else {
                await service.create(input);
              }
              setIsCadenceFormOpen(false);
              setEditingCadence(null);
              notificationsService.success('Cadence saved.');
              await refreshSlots();
            } catch (error) {
              notificationsService.error(mutationErrorMessage(error));
            } finally {
              setIsSlotPending(false);
            }
          })();
        }}
      />
    </>
  );

  const emptyState =
    !isLoading && calendarItems.length === 0 ? (
      <EmptyState
        icon={Calendar}
        title="Nothing scheduled yet"
        description="Plan and schedule your first post to see it on the calendar."
        action={{
          label: 'Create a post',
          onClick: () => push(href(CREATE_POST_AGENT_HREF)),
        }}
      />
    ) : undefined;

  return (
    <ContentCalendar
      items={calendarItems}
      onEventClick={handleEventClick}
      onDateClick={handleDateClick}
      onDatesChange={handleDatesChange}
      onViewChange={setCalendarView}
      getEventColor={getEventColor}
      getEventBadge={getEventBadge}
      preferredTimes={preferredTimes}
      timezone={timezone}
      getEventChannels={getEventChannels}
      getEventActions={getEventActions}
      isItemDraggable={isItemDraggable}
      onEventDrop={handleEventDrop}
      filterControls={filterControls}
      modal={modal}
      emptyState={emptyState}
      isLoading={isLoading}
    />
  );
}
