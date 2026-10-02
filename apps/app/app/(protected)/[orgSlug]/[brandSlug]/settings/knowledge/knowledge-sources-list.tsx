'use client';

import { useContextSidebar } from '@contexts/ui/context-sidebar-context';
import type { KnowledgeSource } from '@genfeedai/client/models';
import {
  AlertCategory,
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
import { formatDate } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useKnowledgeLibrary } from '@pages/library/knowledge/hooks/use-knowledge-library';
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
import AppTable from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { RotateCcw } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import KnowledgeAddSourceSheet from './knowledge-add-source-sheet';
import KnowledgeSourceDetailPanel from './knowledge-source-detail-panel';
import KnowledgeStateBadge from './knowledge-state-badge';

const PURPOSE_KEY: Record<string, string> = {
  BRAND_TRUTH: 'brandTruth',
  INSPIRATION: 'inspiration',
  RESEARCH: 'research',
};

export default function KnowledgeSourcesList({
  brandId,
  isAddOpen,
  onAddClose,
  onSeedHandled,
  seedRequestId,
  website,
}: KnowledgeSourcesListProps) {
  const translate = useTranslations('pages.library.knowledge.list');
  const translatePurpose = useTranslations('pages.library.knowledge.purpose');
  const translateSeed = useTranslations('pages.library.knowledge');
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
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [handledSeedId, setHandledSeedId] = useState(0);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (actionScopeRef.current === actionScope) setIsSubmitting(false);
  }, [actionScope]);

  const visibleRows = useMemo(
    () =>
      selectedSpaceId
        ? rows.filter((row) => row.spaceIds.includes(selectedSpaceId))
        : rows,
    [rows, selectedSpaceId],
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
        onAddClose();
        await refreshRef.current();
      } catch (captureError) {
        if (!isCurrentScope()) return;
        logger.error('Failed to add knowledge source', captureError);
        notifications.error(translate('addError'));
      } finally {
        if (isCurrentScope()) setIsSubmitting(false);
      }
    },
    [
      isCurrentScope,
      brandId,
      getSourcesService,
      notifications,
      onAddClose,
      translate,
    ],
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

  // Brand Kit seed: capture the brand website as Brand Truth exactly once per
  // request id, so a re-render never double-captures.
  useEffect(() => {
    if (seedRequestId === 0 || seedRequestId === handledSeedId) {
      return;
    }
    setHandledSeedId(seedRequestId);
    if (!website) {
      notifications.error(translateSeed('seedNeedsWebsite'));
      onSeedHandled();
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
    }).finally(onSeedHandled);
  }, [
    capture,
    handledSeedId,
    notifications,
    onSeedHandled,
    seedRequestId,
    translateSeed,
    website,
  ]);

  const columns: TableColumn<KnowledgeSourceRow>[] = [
    {
      header: translate('source'),
      key: 'title',
      render: (row) => row.source.title,
      subtext: (row) => row.source.kind,
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
      header: translate('state'),
      key: 'state',
      render: (row) => <KnowledgeStateBadge version={row.version} />,
    },
    {
      header: translate('captured'),
      key: 'observedAt',
      render: (row) => (row.version ? formatDate(row.version.observedAt) : '-'),
    },
  ];

  return (
    <div className="space-y-4">
      {spaces.length > 0 ? (
        <nav aria-label={translate('spaces')} className="flex flex-wrap gap-2">
          <Button
            label={translate('allSources')}
            onClick={() => setSelectedSpaceId(null)}
            variant={
              selectedSpaceId ? ButtonVariant.SECONDARY : ButtonVariant.DEFAULT
            }
          />
          {spaces.map((space) => (
            <Button
              key={space.id}
              label={space.isInbox ? translate('inbox') : space.title}
              onClick={() => setSelectedSpaceId(space.id)}
              variant={
                selectedSpaceId === space.id
                  ? ButtonVariant.DEFAULT
                  : ButtonVariant.SECONDARY
              }
            />
          ))}
        </nav>
      ) : null}

      {(selectionError || isInvalidSelection) && !isLoading ? (
        <Alert type={AlertCategory.ERROR}>
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
        <Alert type={AlertCategory.ERROR}>
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
          columns={columns}
          emptyDescription={translate('emptyDescription')}
          emptyLabel={translate('emptyTitle')}
          getRowKey={(row) => row.source.id}
          isLoading={isLoading}
          items={visibleRows}
          onRowClick={(row) => selectSource(row.source.id)}
        />
      )}

      <KnowledgeAddSourceSheet
        isOpen={isAddOpen}
        isSubmitting={isSubmitting}
        onClose={onAddClose}
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
  );
}
