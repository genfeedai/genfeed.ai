'use client';

import { usePostsLayout } from '@contexts/posts/posts-layout-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  useConfirmModal,
  usePostRepurposeModal,
} from '@genfeedai/contexts/providers/global-modals/global-modals.hooks';
import { ButtonSize, ButtonVariant, ModalEnum } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createArtifactEditorRoute,
} from '@genfeedai/contracts/constants';
import type { ICalendarSlot } from '@genfeedai/contracts/interfaces';
import { openModal } from '@helpers/ui/modal/modal.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { ArticlesService } from '@services/content/articles.service';
import { NewslettersService } from '@services/content/newsletters.service';
import { PostingCadencesService } from '@services/content/posting-cadences.service';
import { PostsService } from '@services/content/posts.service';
import { ReleaseGroupsService } from '@services/content/release-groups.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { FileText, Repeat } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LazyModalArticle } from '@/components/lazy/modal/LazyModal';
import ContentCalendar from '@/features/posts/components/calendar/content-calendar/ContentCalendar';
import type { ContentCalendarPageProps } from '@/features/posts/props/content-calendar-controller.props';
import type { ContentCalendarItem } from '@/features/posts/props/content-calendar-page.props';
import ReleaseDetailDrawer from '@/features/posts/release/release-detail-drawer';
import CalendarRepublishDialog, {
  CALENDAR_MOVE_ACTION,
  CALENDAR_REPUBLISH_ACTION,
} from '@/features/posts/shared/calendar-republish-dialog';
import { useCalendarWeekRange } from '@/hooks/utils/use-calendar-week-range/use-calendar-week-range';
import type {
  CalendarToolbar,
  CalendarViewKey,
} from '@/props/components/calendar.props';
import type { ReleaseCalendarFilters as ReleaseFilters } from '@/props/publisher/release-calendar.props';
import CadenceFormSheet from './cadence-form-sheet';
import { isMissingCalendarSlot } from './calendar-day-aggregate';
import CalendarSlotPanel from './calendar-slot-panel';
import { buildContentCalendarItems } from './content-calendar-items';
import EvergreenSeriesControls from './evergreen-series-controls';
import ReleaseCalendarFilters, {
  EMPTY_RELEASE_CALENDAR_FILTERS,
} from './release-calendar-filters';
import { useCalendarBulkGeneration } from './use-calendar-bulk-generation';
import { useCalendarChannelOptions } from './use-calendar-channel-options';
import { useCalendarEventPresentation } from './use-calendar-event-presentation';
import { useCalendarReleaseActions } from './use-calendar-release-actions';
import { useCalendarSlotActions } from './use-calendar-slot-actions';
import { useContentCalendarData } from './use-content-calendar-data';

export default function ContentCalendarPage({
  campaignId,
  embedded = false,
}: ContentCalendarPageProps = {}): React.JSX.Element {
  const searchParams = useSearchParams();
  const globalFilterQuery = embedded ? searchParams.toString() : '';
  const getNewslettersService = useAuthedService(
    useCallback((token: string) => NewslettersService.getInstance(token), []),
  );
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

  const [selectedSlot, setSelectedSlot] = useState<ICalendarSlot | null>(null);
  const [filters, setFilters] = useState<ReleaseFilters>(
    EMPTY_RELEASE_CALENDAR_FILTERS,
  );
  const [calendarView, setCalendarView] = useState<CalendarViewKey>('week');
  const [dateRange, setDateRange] = useCalendarWeekRange();

  const defaultCredentialId = credentials[0]?.id ?? '';
  const {
    articles,
    newsletters,
    releases,
    setReleases,
    slots,
    setSlots,
    cadences,
    setCadences,
    isLoading,
  } = useContentCalendarData({
    brandId,
    campaignId,
    dateRange,
    filters,
    getArticlesService,
    getNewslettersService,
    getPostingCadencesService,
    getReleaseGroupsService,
    notificationsService,
  });
  const {
    selectedRelease,
    setSelectedReleaseId,
    pendingAction,
    pendingDrop,
    drawerError,
    setDrawerError,
    handleEventDrop,
    handleCancelPendingDrop,
    handleCardOnlyDrop,
    handleRepublishDrop,
    handleRescheduleRelease,
    handleRescheduleTarget,
    handleRetryTarget,
    handleResumeRelease,
    handleAddChannel,
  } = useCalendarReleaseActions({
    releases,
    setReleases,
    getReleaseGroupsService,
    getPostsService,
    notificationsService,
    openPostRepurposeModal,
    push,
    href,
  });
  const {
    editingCadence,
    setEditingCadence,
    isCadenceFormOpen,
    setIsCadenceFormOpen,
    isSlotPending,
    generateSlotByIdentity,
    handleDateClick,
    handleGenerateSlot,
    handleWriteSlot,
    handleSkipSlot,
    handleCancelSlot,
    handleCloseSlot,
    handleEditCadence,
    handleDeleteCadence,
    handleSubmitCadence,
  } = useCalendarSlotActions({
    brandId,
    defaultCredentialId,
    dateRange,
    cadences,
    setCadences,
    setSlots,
    selectedSlot,
    setSelectedSlot,
    setSelectedReleaseId,
    getPostingCadencesService,
    notificationsService,
    push,
    href,
  });
  const { isBulkPending, bulkAbortRef, confirmBulkGenerate } =
    useCalendarBulkGeneration({
      getPostingCadencesService,
      setSlots,
      setSelectedSlot,
      notificationsService,
      openConfirm,
      translate,
    });
  const calendarItems = useMemo(
    () =>
      buildContentCalendarItems({
        articles,
        newsletters,
        releases,
        slots,
        globalFilterQuery,
        calendarView,
        translate,
      }),
    [
      articles,
      newsletters,
      globalFilterQuery,
      calendarView,
      releases,
      slots,
      translate,
    ],
  );

  const {
    getEventColor,
    getEventBadge,
    getEventActions,
    getEventChannels,
    isItemDraggable,
  } = useCalendarEventPresentation({ translate, generateSlotByIdentity });
  const { credentialOptions, platformOptions, preferredTimes } =
    useCalendarChannelOptions({
      credentials,
      credentialIds: filters.credentialId,
    });
  const {
    setExportNode,
    setFiltersNode,
    setLeadingNode,
    setRefresh,
    setScheduleActionsNode,
    setViewToggleNode,
  } = usePostsLayout();
  useEffect(() => {
    if (!embedded) return;
    setRefresh(
      () => () =>
        setDateRange((current) => (current ? { ...current } : current)),
    );
    return () => setRefresh(() => () => {});
  }, [embedded, setRefresh, setDateRange]);

  const timezone =
    selectedBrand?.agentConfig?.schedule?.timezone?.trim() || 'UTC';

  const missingIdentityKeys = useMemo(
    () =>
      slots
        .filter((slot) => isMissingCalendarSlot(slot))
        .map((slot) => slot.identityKey),
    [slots],
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
        // One selection owns the context sidebar at a time.
        setSelectedReleaseId(null);
        setSelectedSlot(item.slot);
        return;
      }

      if (item.itemType === 'newsletter') {
        push(href(createArtifactEditorRoute('newsletter', item.newsletter.id)));
        return;
      }
      if (item.itemType === 'article') {
        // Refinement belongs to the artifact — open the article's editor page.
        push(href(createArtifactEditorRoute('article', item.article.id)));
        return;
      }

      setDrawerError(null);
      setSelectedSlot(null);
      setSelectedReleaseId(item.release.id);
    },
    [confirmBulkGenerate, href, push, setSelectedReleaseId, setDrawerError],
  );

  const handleDatesChange = useCallback(
    (start: Date, end: Date) => {
      setDateRange({ end, start });
    },
    [setDateRange],
  );

  const cadenceActions = useMemo(
    () => (
      <>
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
      </>
    ),
    [
      bulkAbortRef,
      confirmBulkGenerate,
      defaultCredentialId,
      isBulkPending,
      missingIdentityKeys,
      setEditingCadence,
      setIsCadenceFormOpen,
      translate,
    ],
  );

  const filterMenu = useMemo(
    () => (
      <ReleaseCalendarFilters
        credentialOptions={credentialOptions}
        filters={filters}
        onChange={setFilters}
        platformOptions={platformOptions}
      />
    ),
    [credentialOptions, filters, platformOptions],
  );

  const newArticleAction = useMemo(
    () => (
      <Button
        size={ButtonSize.ICON}
        variant={ButtonVariant.GHOST}
        tooltip={translate('newArticle')}
        aria-label={translate('newArticle')}
        onClick={() => openModal(ModalEnum.ARTICLE)}
      >
        <FileText className="size-3.5" />
      </Button>
    ),
    [translate],
  );

  // On the Publishing desk every control lives in the sub bar: the period
  // navigation on the left, then filters, the view dropdown, the cadence
  // actions and the primary action. Nothing sits above the grid.
  useEffect(() => {
    if (!embedded) return;
    setFiltersNode(filterMenu);
    setScheduleActionsNode(cadenceActions);
    setExportNode(newArticleAction);
  }, [
    cadenceActions,
    embedded,
    filterMenu,
    newArticleAction,
    setExportNode,
    setFiltersNode,
    setScheduleActionsNode,
  ]);

  useEffect(() => {
    if (!embedded) return;
    return () => {
      setLeadingNode(null);
      setViewToggleNode(null);
      setFiltersNode(null);
      setScheduleActionsNode(null);
      setExportNode(null);
    };
  }, [
    embedded,
    setExportNode,
    setFiltersNode,
    setLeadingNode,
    setScheduleActionsNode,
    setViewToggleNode,
  ]);

  const handleToolbarChange = useCallback(
    ({ navigation, viewMenu }: CalendarToolbar) => {
      setLeadingNode(navigation);
      setViewToggleNode(viewMenu);
    },
    [setLeadingNode, setViewToggleNode],
  );

  // Outside the desk (a campaign's calendar) the calendar keeps its own bar.
  const filterControls = embedded ? undefined : (
    <>
      {cadenceActions}
      {filterMenu}
      {newArticleAction}
    </>
  );

  const modal = (
    <>
      {!embedded ? (
        <LazyModalArticle
          onConfirm={() =>
            setDateRange((current) => (current ? { ...current } : current))
          }
          onCreated={(ids) => {
            const id = Array.isArray(ids) ? ids[0] : ids;
            if (id) push(href(createArtifactEditorRoute('article', id)));
          }}
        />
      ) : null}
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
        brandId={brandId}
        error={drawerError}
        onAddChannel={handleAddChannel}
        onClose={() => setSelectedReleaseId(null)}
        onRescheduleRelease={handleRescheduleRelease}
        onRescheduleTarget={handleRescheduleTarget}
        onResumeRelease={handleResumeRelease}
        onRetryTarget={handleRetryTarget}
        pendingAction={pendingAction}
        reconnectHref={href(APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS)}
        release={selectedRelease}
      />
      {selectedRelease ? (
        <EvergreenSeriesControls groupId={selectedRelease.id} />
      ) : null}
      <CalendarSlotPanel
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
        onDelete={editingCadence ? handleDeleteCadence : undefined}
        onSubmit={handleSubmitCadence}
      />
    </>
  );

  return (
    <ContentCalendar
      embedded={embedded}
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
      onToolbarChange={embedded ? handleToolbarChange : undefined}
      modal={modal}
      isLoading={isLoading}
    />
  );
}
