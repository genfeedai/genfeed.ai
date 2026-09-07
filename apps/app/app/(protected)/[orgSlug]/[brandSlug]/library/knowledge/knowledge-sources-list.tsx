'use client';

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
import AppTable from '@ui/display/table/Table';
import Alert from '@ui/feedback/alert/Alert';
import { Button } from '@ui/primitives/button';
import { RotateCcw } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import KnowledgeAddSourceSheet from './knowledge-add-source-sheet';
import KnowledgeSourceDetailSheet from './knowledge-source-detail-sheet';
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
  const searchParams = useSearchParams();
  const currentPage = Number(searchParams.get('page')) || 1;
  const { error, isLoading, refresh, rows, spaces } = useKnowledgeLibrary({
    brandId,
    page: currentPage,
  });
  const getSourcesService = useAuthedService((token: string) =>
    KnowledgeSourcesService.getInstance(token),
  );
  const getSpacesService = useAuthedService((token: string) =>
    KnowledgeSpacesService.getInstance(token),
  );
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [handledSeedId, setHandledSeedId] = useState(0);

  const visibleRows = useMemo(
    () =>
      selectedSpaceId
        ? rows.filter((row) => row.spaceIds.includes(selectedSpaceId))
        : rows,
    [rows, selectedSpaceId],
  );
  const selectedRow =
    rows.find((row) => row.source.id === selectedSourceId) ?? null;

  const capture = useCallback(
    async (request: KnowledgeSourceCaptureRequest) => {
      setIsSubmitting(true);
      try {
        const service = await getSourcesService();
        await service.capture(request, brandId);
        notifications.success(translate('addSuccess'));
        onAddClose();
        await refresh();
      } catch (captureError) {
        logger.error('Failed to add knowledge source', captureError);
        notifications.error(translate('addError'));
      } finally {
        setIsSubmitting(false);
      }
    },
    [brandId, getSourcesService, notifications, onAddClose, refresh, translate],
  );

  const retry = useCallback(
    async (source: KnowledgeSource) => {
      try {
        const service = await getSourcesService();
        await service.retry(source.id, brandId);
        notifications.success(translate('retrySuccess'));
        await refresh();
      } catch (retryError) {
        logger.error('Failed to retry knowledge ingestion', retryError);
        notifications.error(translate('retryError'));
      }
    },
    [brandId, getSourcesService, notifications, refresh, translate],
  );

  const update = useCallback(
    async (source: KnowledgeSource, body: KnowledgeSourceUpdateRequest) => {
      try {
        const service = await getSourcesService();
        await service.update(source.id, body, brandId);
        await refresh();
      } catch (updateError) {
        logger.error('Failed to update knowledge source', updateError);
        notifications.error(translate('updateError'));
      }
    },
    [brandId, getSourcesService, notifications, refresh, translate],
  );

  const archive = useCallback(
    async (source: KnowledgeSource) => {
      try {
        const service = await getSourcesService();
        await service.archive(source.id, brandId);
        notifications.success(translate('archiveSuccess'));
        setSelectedSourceId(null);
        await refresh();
      } catch (archiveError) {
        logger.error('Failed to archive knowledge source', archiveError);
        notifications.error(translate('archiveError'));
      }
    },
    [brandId, getSourcesService, notifications, refresh, translate],
  );

  const moveToSpace = useCallback(
    async (source: KnowledgeSource, spaceId: string) => {
      try {
        const service = await getSpacesService();
        await service.addMember(spaceId, source.id, brandId);
        await refresh();
      } catch (moveError) {
        logger.error('Failed to add knowledge source to space', moveError);
        notifications.error(translate('moveError'));
      }
    },
    [brandId, getSpacesService, notifications, refresh, translate],
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
          onRowClick={(row) => setSelectedSourceId(row.source.id)}
        />
      )}

      <KnowledgeAddSourceSheet
        isOpen={isAddOpen}
        isSubmitting={isSubmitting}
        onClose={onAddClose}
        onSubmit={capture}
      />
      <KnowledgeSourceDetailSheet
        brandId={brandId}
        isOpen={selectedRow !== null}
        onArchive={archive}
        onClose={() => setSelectedSourceId(null)}
        onMoveToSpace={moveToSpace}
        onRetry={retry}
        onUpdate={update}
        row={selectedRow}
        spaces={spaces}
      />
    </div>
  );
}
