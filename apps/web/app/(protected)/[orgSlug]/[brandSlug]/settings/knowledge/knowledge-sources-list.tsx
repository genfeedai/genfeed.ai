'use client';

import { useContextSidebar } from '@contexts/ui/context-sidebar-context';
import type { KnowledgeSource } from '@genfeedai/client/models';
import {
  ButtonSize,
  ButtonVariant,
  KnowledgeMemoryScope,
  KnowledgeProcessingState,
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type {
  KnowledgeSourceCaptureRequest,
  KnowledgeSourceUpdateRequest,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  KnowledgeSourceRow,
  KnowledgeSourcesListProps,
} from '@props/content/knowledge-library.props';
import type { TableColumn } from '@props/ui/display/table.props';
import { KnowledgeSourcesService } from '@services/content/knowledge-sources.service';
import { KnowledgeSpacesService } from '@services/content/knowledge-spaces.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { isServiceOperationError } from '@services/core/operation-error';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import AppTable from '@ui/display/table/Table';
import TableDateCell from '@ui/display/table/TableDateCell';
import Container from '@ui/layout/container/Container';
import SubbarControls from '@ui/layout/subbar-controls/SubbarControls';
import { Alert } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import {
  SHELL_ICON_BUTTON_CLASS,
  SHELL_ICON_CLASS,
} from '@ui-constants/shell-chrome.constant';
import { Globe, Plus, RotateCcw } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import SearchField from '@/components/content/search-field/SearchField';
import { useKnowledgeLibrary } from '@/features/library/knowledge/hooks/use-knowledge-library';
import KnowledgeAddSourceSheet from './knowledge-add-source-sheet';
import KnowledgeSourceDetailPanel from './knowledge-source-detail-panel';
import {
  filterKnowledgeRows,
  getSourceLink,
  getSourceSnippet,
  KIND_DISPLAY,
} from './knowledge-source-display';
import KnowledgeStateBadge from './knowledge-state-badge';
import { useKnowledgeFilters } from './use-knowledge-filters';

const ALL = 'all';

const PURPOSE_KEY: Record<string, string> = {
  BRAND_TRUTH: 'brandTruth',
  INSPIRATION: 'inspiration',
  RESEARCH: 'research',
};

export default function KnowledgeSourcesList({
  brandId,
  website,
}: KnowledgeSourcesListProps) {
  const translate = useTranslations('pages.library.knowledge.list');
  const translatePurpose = useTranslations('pages.library.knowledge.purpose');
  const translatePage = useTranslations('pages.library.knowledge');
  const translateFilters = useTranslations('pages.library.knowledge.filters');
  const translateKind = useTranslations('pages.library.knowledge.kind');
  const translateState = useTranslations('pages.library.knowledge.state');
  const {
    clearFilters,
    filters,
    hasActiveFilters,
    setSearch,
    setSpace,
    setStatus,
    setType,
  } = useKnowledgeFilters();
  const notifications = NotificationsService.getInstance();
  const revealDetails = useContextSidebar()?.reveal;
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const currentPage = Number(searchParams.get('page')) || 1;
  const sourceIds = searchParams.getAll('sourceId');
  const isInvalidSelection =
    sourceIds.length > 0 &&
    (sourceIds.length !== 1 ||
      !sourceIds[0] ||
      sourceIds[0].length > 128 ||
      /[^A-Za-z0-9_-]/.test(sourceIds[0]));
  const routeSourceId = isInvalidSelection ? null : (sourceIds[0] ?? null);
  const [localSelectedSourceId, setSelectedSourceId] = useState<string | null>(
    routeSourceId,
  );
  const appliedRouteRef = useRef(routeSourceId);
  const selectedSourceId =
    appliedRouteRef.current === routeSourceId
      ? localSelectedSourceId
      : routeSourceId;
  const selectionRef = useRef(selectedSourceId);
  selectionRef.current = selectedSourceId;
  const navigationRef = useRef({
    pathname,
    router,
    search: searchParams.toString(),
  });
  navigationRef.current = { pathname, router, search: searchParams.toString() };
  const changeSelection = useCallback(
    (sourceId: string | null, archivedId?: string) => {
      selectionRef.current = sourceId;
      setSelectedSourceId(sourceId);
      const navigation = navigationRef.current;
      const params = new URLSearchParams(navigation.search);
      const incomingIds = params.getAll('sourceId');
      if (
        archivedId &&
        (incomingIds.length !== 1 || incomingIds[0] !== archivedId)
      )
        return;
      params.delete('sourceId');
      if (sourceId) params.set('sourceId', sourceId);
      const query = params.toString();
      navigation.router.replace(
        `${navigation.pathname}${query ? `?${query}` : ''}`,
        { scroll: false },
      );
    },
    [],
  );
  // Only incoming navigation changes selection; polling/rerenders cannot reopen a closed panel.
  useEffect(() => {
    appliedRouteRef.current = routeSourceId;
    selectionRef.current = routeSourceId;
    setSelectedSourceId(routeSourceId);
  }, [routeSourceId]);
  const {
    error,
    isLoading,
    refresh,
    rows,
    spaces,
    selectedRow: loadedSelectedRow,
    selectionError,
  } = useKnowledgeLibrary({
    brandId,
    page: currentPage,
    selectedSourceId: selectedSourceId ?? undefined,
  });
  const getSourcesService = useAuthedService((token: string) =>
    KnowledgeSourcesService.getInstance(token),
  );
  const getSpacesService = useAuthedService((token: string) =>
    KnowledgeSpacesService.getInstance(token),
  );
  const actionScope = useMemo(
    () => ({ brandId, getSourcesService, getSpacesService, pathname }),
    [brandId, getSourcesService, getSpacesService, pathname],
  );
  const actionScopeRef = useRef(actionScope);
  actionScopeRef.current = actionScope;
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const isCurrentScope = useCallback(
    () => isMountedRef.current && actionScopeRef.current === actionScope,
    [actionScope],
  );
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (actionScopeRef.current === actionScope) setIsSubmitting(false);
  }, [actionScope]);

  const visibleRows = useMemo(
    () => filterKnowledgeRows(rows, filters),
    [filters, rows],
  );
  const selectedRow =
    !isLoading && !selectionError && !isInvalidSelection
      ? loadedSelectedRow?.source.id === selectedSourceId
        ? loadedSelectedRow
        : (rows.find((row) => row.source.id === selectedSourceId) ?? null)
      : null;

  const actionableRef = useRef({
    isLoading,
    rowIds: new Set(rows.map((row) => row.source.id)),
    selectedId: selectedRow?.source.id,
  });
  actionableRef.current = {
    isLoading,
    rowIds: new Set(rows.map((row) => row.source.id)),
    selectedId: selectedRow?.source.id,
  };
  const isActionableSource = useCallback((sourceId: string) => {
    const current = actionableRef.current;
    return (
      !current.isLoading &&
      (selectionRef.current === sourceId
        ? current.selectedId === sourceId
        : current.rowIds.has(sourceId))
    );
  }, []);

  const capture = useCallback(
    async (request: KnowledgeSourceCaptureRequest) => {
      if (!isCurrentScope() || !brandId) return;
      setIsSubmitting(true);
      try {
        const service = await getSourcesService();
        if (!isCurrentScope()) return;
        await service.capture(request, brandId);
        if (!isCurrentScope()) return;
        notifications.success(translate('addSuccess'));
        setIsAddOpen(false);
        await refreshRef.current();
      } catch (captureError) {
        if (!isCurrentScope()) return;
        logger.error('Failed to add knowledge source', captureError);
        notifications.error(translate('addError'));
      } finally {
        if (isCurrentScope()) setIsSubmitting(false);
      }
    },
    [isCurrentScope, brandId, getSourcesService, notifications, translate],
  );

  const retry = useCallback(
    async (source: KnowledgeSource) => {
      if (!isCurrentScope() || !brandId || !isActionableSource(source.id))
        return;
      const selectionAtStart = selectionRef.current;
      try {
        const service = await getSourcesService();
        if (
          !isCurrentScope() ||
          selectionRef.current !== selectionAtStart ||
          !isActionableSource(source.id)
        )
          return;
        await service.retry(source.id, brandId);
        if (!isCurrentScope()) return;
        notifications.success(translate('retrySuccess'));
        await refreshRef.current();
      } catch (retryError) {
        if (!isCurrentScope()) return;
        logger.error('Failed to retry knowledge ingestion', retryError);
        notifications.error(translate('retryError'));
      }
    },
    [
      isActionableSource,
      isCurrentScope,
      brandId,
      getSourcesService,
      notifications,
      translate,
    ],
  );

  const refreshNow = useCallback(
    async (source: KnowledgeSource) => {
      if (!isCurrentScope() || !brandId || !isActionableSource(source.id))
        return;
      const selectionAtStart = selectionRef.current;
      try {
        const service = await getSourcesService();
        if (
          !isCurrentScope() ||
          selectionRef.current !== selectionAtStart ||
          !isActionableSource(source.id)
        )
          return;
        await service.refresh(
          source.id,
          brandId,
          `refresh-${source.id}-${Date.now()}`,
        );
        if (!isCurrentScope()) return;
        notifications.success(translate('refreshSuccess'));
        await refreshRef.current();
      } catch (refreshError) {
        if (!isCurrentScope()) return;
        if (
          isServiceOperationError(refreshError) &&
          refreshError.status === 422 &&
          refreshError.category === 'Knowledge source unavailable'
        ) {
          notifications.error(
            translate('refreshUnavailable', { title: source.title }),
          );
          await refreshRef.current();
          return;
        }
        logger.error('Failed to refresh knowledge source', refreshError);
        notifications.error(translate('refreshError'));
      }
    },
    [
      isActionableSource,
      isCurrentScope,
      brandId,
      getSourcesService,
      notifications,
      translate,
    ],
  );

  const updateRefreshPolicy = useCallback(
    async (source: KnowledgeSource, policy: { isEnabled: boolean }) => {
      if (!isCurrentScope() || !brandId || !isActionableSource(source.id))
        return;
      const selectionAtStart = selectionRef.current;
      try {
        const service = await getSourcesService();
        if (
          !isCurrentScope() ||
          selectionRef.current !== selectionAtStart ||
          !isActionableSource(source.id)
        )
          return;
        await service.setRefreshPolicy(source.id, policy, brandId);
        if (!isCurrentScope()) return;
        await refreshRef.current();
      } catch (policyError) {
        if (!isCurrentScope()) return;
        logger.error('Failed to update knowledge refresh policy', policyError);
        notifications.error(translate('updateError'));
      }
    },
    [
      isActionableSource,
      isCurrentScope,
      brandId,
      getSourcesService,
      notifications,
      translate,
    ],
  );

  const update = useCallback(
    async (source: KnowledgeSource, body: KnowledgeSourceUpdateRequest) => {
      if (!isCurrentScope() || !brandId || !isActionableSource(source.id))
        return;
      const selectionAtStart = selectionRef.current;
      try {
        const service = await getSourcesService();
        if (
          !isCurrentScope() ||
          selectionRef.current !== selectionAtStart ||
          !isActionableSource(source.id)
        )
          return;
        await service.update(source.id, body, brandId);
        if (!isCurrentScope()) return;
        await refreshRef.current();
      } catch (updateError) {
        if (!isCurrentScope()) return;
        logger.error('Failed to update knowledge source', updateError);
        notifications.error(translate('updateError'));
      }
    },
    [
      isActionableSource,
      isCurrentScope,
      brandId,
      getSourcesService,
      notifications,
      translate,
    ],
  );

  const archive = useCallback(
    async (source: KnowledgeSource) => {
      if (!isCurrentScope() || !brandId || !isActionableSource(source.id))
        return;
      const selectionAtStart = selectionRef.current;
      try {
        const service = await getSourcesService();
        if (
          !isCurrentScope() ||
          selectionRef.current !== selectionAtStart ||
          !isActionableSource(source.id)
        )
          return;
        await service.archive(source.id, brandId);
        if (!isCurrentScope()) return;
        notifications.success(translate('archiveSuccess'));
        // The row may have changed while the archive was in flight.
        if (selectionRef.current === source.id)
          changeSelection(null, source.id);
        await refreshRef.current();
      } catch (archiveError) {
        if (!isCurrentScope()) return;
        logger.error('Failed to archive knowledge source', archiveError);
        notifications.error(translate('archiveError'));
      }
    },
    [
      changeSelection,
      isActionableSource,
      isCurrentScope,
      brandId,
      getSourcesService,
      notifications,
      translate,
    ],
  );

  // Re-clicking the selected source reopens details the user collapsed.
  const selectSource = useCallback(
    (sourceId: string) => {
      if (sourceId === selectedSourceId) {
        revealDetails?.();
        return;
      }
      changeSelection(sourceId);
    },
    [changeSelection, revealDetails, selectedSourceId],
  );

  const moveToSpace = useCallback(
    async (source: KnowledgeSource, spaceId: string) => {
      if (!isCurrentScope() || !brandId || !isActionableSource(source.id))
        return;
      const selectionAtStart = selectionRef.current;
      try {
        const service = await getSpacesService();
        if (
          !isCurrentScope() ||
          selectionRef.current !== selectionAtStart ||
          !isActionableSource(source.id)
        )
          return;
        await service.addMember(spaceId, source.id, brandId);
        if (!isCurrentScope()) return;
        await refreshRef.current();
      } catch (moveError) {
        if (!isCurrentScope()) return;
        logger.error('Failed to add knowledge source to space', moveError);
        notifications.error(translate('moveError'));
      }
    },
    [
      isActionableSource,
      isCurrentScope,
      brandId,
      getSpacesService,
      notifications,
      translate,
    ],
  );

  // Brand Kit seed: capture the brand website as Brand Truth.
  const seedFromBrandKit = useCallback(() => {
    if (!website) {
      notifications.error(translatePage('seedNeedsWebsite'));
      return;
    }
    let hostname = website;
    try {
      hostname = new URL(website).hostname;
    } catch {
      hostname = website;
    }
    void capture({
      kind: KnowledgeSourceKind.URL,
      purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
      referenceUrl: website,
      scope: KnowledgeMemoryScope.BRAND,
      title: hostname,
    });
  }, [capture, notifications, translatePage, website]);

  const columns: TableColumn<KnowledgeSourceRow>[] = [
    {
      header: translate('source'),
      key: 'title',
      render: (row) => {
        const link = getSourceLink(row);
        const snippet = link ? null : getSourceSnippet(row);
        const { icon: KindIcon, labelKey } = KIND_DISPLAY[row.source.kind];
        return (
          <div className="flex min-w-0 max-w-[12rem] items-start gap-3 2xl:max-w-md">
            <KindIcon
              aria-label={translateKind(labelKey)}
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              role="img"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-medium">{row.source.title}</span>
              {link ? (
                <a
                  aria-label={translate('openLink', {
                    title: row.source.title,
                  })}
                  className="truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
                  href={link.href}
                  onClick={(event) => event.stopPropagation()}
                  rel="noreferrer"
                  target="_blank"
                >
                  {link.label}
                </a>
              ) : snippet ? (
                <span className="truncate text-xs text-muted-foreground">
                  {snippet}
                </span>
              ) : null}
            </div>
          </div>
        );
      },
      sortValue: (row) => row.source.title,
    },
    {
      header: translate('purpose'),
      key: 'purpose',
      render: (row) =>
        PURPOSE_KEY[row.source.purpose]
          ? translatePurpose(PURPOSE_KEY[row.source.purpose])
          : row.source.purpose,
    },
    {
      header: translate('status'),
      key: 'state',
      render: (row) => <KnowledgeStateBadge version={row.version} />,
      sortValue: (row) => row.version?.processingState,
    },
    {
      header: translate('captured'),
      key: 'observedAt',
      render: (row) => <TableDateCell value={row.version?.observedAt} />,
      sortValue: (row) => row.version?.observedAt,
    },
  ];

  const spaceOptions = [
    { label: translate('allSources'), value: ALL },
    ...spaces.map((space) => ({
      label: space.isInbox ? translate('inbox') : space.title,
      // A space the user named is shown as written.
      isLiteral: !space.isInbox,
      value: space.id,
    })),
  ];
  const activeSpaceId = spaces.some((space) => space.id === filters.spaceId)
    ? (filters.spaceId ?? ALL)
    : ALL;

  return (
    <Container
      label={translatePage('title')}
      leading={
        <SearchField
          ariaLabel={translate('search')}
          onSearch={setSearch}
          placeholder={translate('search')}
          value={filters.search}
        >
          <FilterMenu
            facets={[
              {
                defaultValue: ALL,
                key: 'space',
                label: translateFilters('space'),
                onChange: setSpace,
                options: spaceOptions,
                selection: 'single',
                value: activeSpaceId,
              },
              {
                defaultValue: ALL,
                key: 'status',
                label: translateFilters('status'),
                onChange: setStatus,
                options: [
                  { label: translate('all'), value: ALL },
                  ...Object.values(KnowledgeProcessingState).map((state) => ({
                    label: translateState(state.toLowerCase()),
                    value: state.toLowerCase(),
                  })),
                ],
                selection: 'single',
                value: filters.status ?? ALL,
              },
              {
                defaultValue: ALL,
                key: 'type',
                label: translateFilters('type'),
                onChange: setType,
                options: [
                  { label: translate('all'), value: ALL },
                  ...Object.values(KnowledgeSourceKind).map((kind) => ({
                    label: translateKind(KIND_DISPLAY[kind].labelKey),
                    value: kind.toLowerCase(),
                  })),
                ],
                selection: 'single',
                value: filters.type ?? ALL,
              },
            ]}
            isAttached
            onClear={clearFilters}
          />
        </SearchField>
      }
      moduleChrome
      refresh={
        <ButtonRefresh
          isRefreshing={isLoading}
          onClick={() => {
            void refresh();
          }}
        />
      }
      iconActions={
        <Button
          ariaLabel={translatePage('seedFromBrandKit')}
          className={SHELL_ICON_BUTTON_CLASS}
          icon={<Globe className={SHELL_ICON_CLASS} />}
          isDisabled={isSubmitting}
          onClick={seedFromBrandKit}
          size={ButtonSize.ICON}
          tooltip={translatePage('seedFromBrandKit')}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        />
      }
      right={
        <SubbarControls
          primaryAction={
            <Button
              icon={<Plus className="size-4" />}
              label={translatePage('addSource')}
              onClick={() => setIsAddOpen(true)}
              size={ButtonSize.SM}
            />
          }
        />
      }
    >
      <div className="space-y-4">
        {(selectionError || isInvalidSelection) && !isLoading ? (
          <Alert variant="destructive">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{translate('loadError')}</span>
              <Button
                label={translate('retry')}
                onClick={() => {
                  void refresh();
                }}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          </Alert>
        ) : null}

        {error && !isLoading ? (
          <Alert variant="destructive">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <Button
                label={translate('retry')}
                onClick={() => {
                  void refresh();
                }}
                variant={ButtonVariant.SECONDARY}
              />
            </div>
          </Alert>
        ) : (
          <AppTable<KnowledgeSourceRow>
            actions={[
              {
                icon: <RotateCcw className="size-4" />,
                isVisible: (row) =>
                  row.version?.processingState ===
                  KnowledgeProcessingState.FAILED,
                onClick: (row) => {
                  void retry(row.source);
                },
                tooltip: translate('retryIngestion'),
              },
            ]}
            ariaLabel={translatePage('title')}
            columns={columns}
            emptyLabel={
              hasActiveFilters && rows.length > 0
                ? translate('noMatches')
                : translate('emptyTitle')
            }
            getItemId={(row) => row.source.id}
            getRowKey={(row) => row.source.id}
            isLoading={isLoading}
            items={visibleRows}
            onRowClick={(row) => selectSource(row.source.id)}
            selectedIds={selectedSourceId ? [selectedSourceId] : []}
          />
        )}

        <KnowledgeAddSourceSheet
          isOpen={isAddOpen}
          isSubmitting={isSubmitting}
          onClose={() => setIsAddOpen(false)}
          onSubmit={capture}
        />
        <KnowledgeSourceDetailPanel
          brandId={brandId}
          onArchive={archive}
          onClose={() => changeSelection(null)}
          onMoveToSpace={moveToSpace}
          onRefresh={refreshNow}
          onRetry={retry}
          onUpdateRefreshPolicy={updateRefreshPolicy}
          onUpdate={update}
          row={selectedRow}
          spaces={spaces}
        />
      </div>
    </Container>
  );
}
