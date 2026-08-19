'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  APP_ROUTES,
  createArtifactEditorRoute,
  withArtifactEditorReturn,
} from '@genfeedai/constants';
import {
  ArticleStatus,
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
  IReleaseGroup,
} from '@genfeedai/interfaces';
import { buildAgentPromptHref } from '@genfeedai/utils/url/desktop-loop-url.util';
import { getPublisherPostsHref } from '@helpers/content/posts.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useCalendarWeekRange } from '@hooks/utils/use-calendar-week-range/use-calendar-week-range';
import type {
  CalendarEventBadge,
  CalendarEventChannel,
  CalendarEventDrop,
  CalendarItem,
} from '@props/components/calendar.props';
import type {
  ReleaseCalendarFilterOption,
  ReleaseCalendarFilters as ReleaseFilters,
} from '@props/publisher/release-calendar.props';
import { usePostRepurposeModal } from '@providers/global-modals/global-modals.provider';
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
import { useCallback, useEffect, useMemo, useState } from 'react';

const WRITE_ARTICLE_AGENT_HREF = buildAgentPromptHref(
  'Help me write a new long-form article for my brand.',
);
const CREATE_POST_AGENT_HREF = buildAgentPromptHref(
  'Help me draft a new post for my brand.',
);

import CadenceFormSheet from './cadence-form-sheet';
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
import {
  isReleaseReschedulable,
  releaseStatusBadge,
  releaseTargets,
} from './release-status.helpers';

const DEFAULT_COLOR = '#8b5cf6';
const ARTICLE_STATUS_COLORS: Record<string, string> = {
  [ArticleStatus.ARCHIVED]: '#ef4444',
  [ArticleStatus.DRAFT]: '#6b7280',
  [ArticleStatus.PUBLISHED]: '#10b981',
};

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

type ContentCalendarItem =
  | ArticleContentCalendarItem
  | ReleaseContentCalendarItem
  | SlotContentCalendarItem;

function getArticleColor(status: string): string {
  return ARTICLE_STATUS_COLORS[status] ?? DEFAULT_COLOR;
}

function mutationErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The schedule change could not be saved.';
}

/** Earliest instant a release occupies, so a target-only schedule still lands. */
function releaseInstant(release: IReleaseGroup): string | undefined {
  return (
    release.scheduledAt ??
    releaseTargets(release).find((target) => target.scheduledAt)?.scheduledAt ??
    undefined
  );
}

export default function ContentCalendarPage(): React.JSX.Element {
  const { brandId, credentials } = useBrand();
  const { push } = useRouter();
  const { href } = useOrgUrl();

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
  const [selectedSlot, setSelectedSlot] = useState<ICalendarSlot | null>(null);
  const [isCadenceFormOpen, setIsCadenceFormOpen] = useState(false);
  const [isSlotPending, setIsSlotPending] = useState(false);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
    null,
  );
  const [filters, setFilters] = useState<ReleaseFilters>(
    EMPTY_RELEASE_CALENDAR_FILTERS,
  );
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [drawerError, setDrawerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [dateRange, setDateRange] = useCalendarWeekRange();

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

        const [fetchedArticles, fetchedReleases, fetchedSlots] =
          await Promise.all([
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
          ]);

        if (controller.signal.aborted) {
          return;
        }

        setArticles(fetchedArticles);
        setReleases(fetchedReleases);
        setSlots(fetchedSlots);
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
        scheduledDate: releaseInstant(release),
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

    return [...releaseItems, ...articleItems, ...slotItems];
  }, [articles, releases, slots]);

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
        setReleases((current) =>
          current.map((release) =>
            release.id === updated.id ? updated : release,
          ),
        );
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

  const handleEventClick = useCallback(
    (item: ContentCalendarItem) => {
      if (item.itemType === 'slot') {
        setSelectedSlot(item.slot);
        return;
      }

      if (item.itemType === 'article') {
        // Refinement belongs to the artifact — open the article's editor page.
        push(
          withArtifactEditorReturn(
            href(createArtifactEditorRoute('article', item.article.id)),
            href(APP_ROUTES.PUBLISH.CALENDAR),
          ),
        );
        return;
      }

      setDrawerError(null);
      setSelectedReleaseId(item.release.id);
    },
    [href, push],
  );

  const handleDatesChange = useCallback(
    (start: Date, end: Date) => {
      setDateRange({ end, start });
    },
    [setDateRange],
  );

  const getEventColor = useCallback((item: ContentCalendarItem) => {
    if (item.itemType === 'article') {
      return getArticleColor(item.status);
    }

    if (item.itemType === 'slot') {
      return '#64748b';
    }

    return DEFAULT_COLOR;
  }, []);

  const getEventBadge = useCallback(
    (item: ContentCalendarItem): CalendarEventBadge | null =>
      item.itemType === 'release'
        ? releaseStatusBadge(item.release)
        : item.itemType === 'slot'
          ? {
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
            }
          : null,
    [],
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
      item.itemType === 'release' && isReleaseReschedulable(item.release),
    [],
  );

  const handleEventDrop = useCallback(
    (change: CalendarEventDrop<ContentCalendarItem>) => {
      if (change.item.itemType !== 'release') {
        change.revert();
        return;
      }

      const { release } = change.item;
      const scheduledDate = change.start.toISOString();
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
    [releases, runMutation],
  );

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
                  ? `/publish/review?batch=${draft.reviewBatchId}&filter=ready`
                  : '/publish/review',
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
      setIsSlotPending(true);
      void (async () => {
        try {
          const service = await getPostingCadencesService();
          const filled = await service.generate({
            brief,
            identityKey: selectedSlot.identityKey,
          });
          setSlots((current) =>
            current.filter((slot) => slot.identityKey !== filled.identityKey),
          );
          setSelectedSlot(null);
          notificationsService.success('Slot generated.');
        } catch (error) {
          notificationsService.error(mutationErrorMessage(error));
        } finally {
          setIsSlotPending(false);
        }
      })();
    },
    [getPostingCadencesService, notificationsService, selectedSlot],
  );

  const handleWriteSlot = useCallback(() => {
    if (!selectedSlot) {
      return;
    }
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
          push(
            withArtifactEditorReturn(
              href(createArtifactEditorRoute('post', filled.generatedItemId)),
              href(APP_ROUTES.PUBLISH.CALENDAR),
            ),
          );
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
        onClick={() => setIsCadenceFormOpen(true)}
        size={ButtonSize.SM}
        variant={ButtonVariant.SECONDARY}
      >
        <Repeat className="size-4" />
        Cadence
      </Button>
      <ReleaseCalendarFilters
        credentialOptions={credentialOptions}
        filters={filters}
        onChange={setFilters}
        platformOptions={platformOptions}
      />
      <Link
        href={href(getPublisherPostsHref())}
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
        onClose={() => setSelectedSlot(null)}
        onGenerate={handleGenerateSlot}
        onWrite={handleWriteSlot}
        slot={selectedSlot}
      />
      <CadenceFormSheet
        brandId={brandId}
        credentialId={defaultCredentialId}
        isOpen={isCadenceFormOpen}
        isPending={isSlotPending}
        onClose={() => setIsCadenceFormOpen(false)}
        onSubmit={(input) => {
          setIsSlotPending(true);
          void (async () => {
            try {
              const service = await getPostingCadencesService();
              await service.create(input);
              setIsCadenceFormOpen(false);
              notificationsService.success('Cadence saved.');
              if (dateRange && brandId) {
                const nextSlots = await service.listSlots({
                  brandId,
                  endDate: dateRange.end.toISOString(),
                  startDate: dateRange.start.toISOString(),
                });
                setSlots(nextSlots);
              }
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
      getEventColor={getEventColor}
      getEventBadge={getEventBadge}
      getEventChannels={getEventChannels}
      isItemDraggable={isItemDraggable}
      onEventDrop={handleEventDrop}
      filterControls={filterControls}
      modal={modal}
      emptyState={emptyState}
      isLoading={isLoading}
    />
  );
}
