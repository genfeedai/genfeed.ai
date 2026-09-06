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
import { useCallback, useEffect, useMemo, useState } from 'react';
import KnowledgeAddSourceSheet from './knowledge-add-source-sheet';
import KnowledgeSourceDetailSheet from './knowledge-source-detail-sheet';
import KnowledgeStateBadge from './knowledge-state-badge';

const PURPOSE_LABEL: Record<string, string> = {
  BRAND_TRUTH: 'Brand Truth',
  INSPIRATION: 'Inspiration',
  RESEARCH: 'Research',
};

export default function KnowledgeSourcesList({
  brandId,
  isAddOpen,
  onAddClose,
  onSeedHandled,
  seedRequestId,
  website,
}: KnowledgeSourcesListProps) {
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
        notifications.success('Source added; ingestion started');
        onAddClose();
        await refresh();
      } catch (captureError) {
        logger.error('Failed to add knowledge source', captureError);
        notifications.error('Failed to add source');
      } finally {
        setIsSubmitting(false);
      }
    },
    [brandId, getSourcesService, notifications, onAddClose, refresh],
  );

  const retry = useCallback(
    async (source: KnowledgeSource) => {
      try {
        const service = await getSourcesService();
        await service.retry(source.id, brandId);
        notifications.success('Ingestion requeued');
        await refresh();
      } catch (retryError) {
        logger.error('Failed to retry knowledge ingestion', retryError);
        notifications.error('Failed to retry ingestion');
      }
    },
    [brandId, getSourcesService, notifications, refresh],
  );

  const update = useCallback(
    async (source: KnowledgeSource, body: KnowledgeSourceUpdateRequest) => {
      try {
        const service = await getSourcesService();
        await service.update(source.id, body, brandId);
        await refresh();
      } catch (updateError) {
        logger.error('Failed to update knowledge source', updateError);
        notifications.error('Failed to update source');
      }
    },
    [brandId, getSourcesService, notifications, refresh],
  );

  const archive = useCallback(
    async (source: KnowledgeSource) => {
      try {
        const service = await getSourcesService();
        await service.archive(source.id, brandId);
        notifications.success('Source archived');
        setSelectedSourceId(null);
        await refresh();
      } catch (archiveError) {
        logger.error('Failed to archive knowledge source', archiveError);
        notifications.error('Failed to archive source');
      }
    },
    [brandId, getSourcesService, notifications, refresh],
  );

  const moveToSpace = useCallback(
    async (source: KnowledgeSource, spaceId: string) => {
      try {
        const service = await getSpacesService();
        await service.addMember(spaceId, source.id, brandId);
        await refresh();
      } catch (moveError) {
        logger.error('Failed to add knowledge source to space', moveError);
        notifications.error('Failed to move source');
      }
    },
    [brandId, getSpacesService, notifications, refresh],
  );

  // Brand Kit seed: capture the brand website as Brand Truth exactly once per
  // request id, so a re-render never double-captures.
  useEffect(() => {
    if (seedRequestId === 0 || seedRequestId === handledSeedId) {
      return;
    }
    setHandledSeedId(seedRequestId);
    if (!website) {
      notifications.error('Add a website to the Brand Kit first');
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
    website,
  ]);

  const columns: TableColumn<KnowledgeSourceRow>[] = [
    {
      header: 'Source',
      key: 'title',
      render: (row) => row.source.title,
      subtext: (row) => row.source.kind,
    },
    {
      header: 'Purpose',
      key: 'purpose',
      render: (row) => PURPOSE_LABEL[row.source.purpose] ?? row.source.purpose,
    },
    {
      header: 'State',
      key: 'state',
      render: (row) => <KnowledgeStateBadge version={row.version} />,
    },
    {
      header: 'Captured',
      key: 'observedAt',
      render: (row) => (row.version ? formatDate(row.version.observedAt) : '-'),
    },
  ];

  return (
    <div className="space-y-4">
      {spaces.length > 0 ? (
        <nav aria-label="Spaces" className="flex flex-wrap gap-2">
          <Button
            label="All sources"
            onClick={() => setSelectedSpaceId(null)}
            variant={
              selectedSpaceId ? ButtonVariant.SECONDARY : ButtonVariant.DEFAULT
            }
          />
          {spaces.map((space) => (
            <Button
              key={space.id}
              label={space.isInbox ? 'Inbox' : space.title}
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
              label="Retry"
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
              tooltip: 'Retry ingestion',
            },
          ]}
          columns={columns}
          emptyDescription="Add a web page, a document or pasted text and Genfeed will cite it in generations."
          emptyLabel="No knowledge sources yet"
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
