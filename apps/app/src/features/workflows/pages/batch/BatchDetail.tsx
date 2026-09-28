'use client';

import {
  ButtonSize,
  ButtonVariant,
  formatEnumLabel,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { getWorkflowLabel } from '@genfeedai/helpers/automation/workflow-execution.helper';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import { downloadIngredient } from '@helpers/media/download/download.helper';
import Card from '@ui/card/Card';
import CollectionGrid from '@ui/collection/CollectionGrid';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionSection from '@ui/collection/CollectionSection';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import { Download, FolderOpen } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type {
  BatchExecution,
  BatchExecutionItem,
  WorkflowSummary,
} from '@/features/workflows/services/workflow-api';
import { isTerminalBatchStatus } from '@/features/workflows/utils/batch-status';

type OutputEntry = {
  ingredient: IIngredient;
  item: BatchExecutionItem;
};

type Props = {
  activeBatchStatus: BatchExecution;
  availableOutputs: OutputEntry[];
  selectedOutputs: OutputEntry[];
  selectedOutputIds: Set<string>;
  isRunningBulkAction: boolean;
  workflowsById: Map<string, WorkflowSummary>;
  onBackToComposer: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDownload: (scope: 'all' | 'selected') => void;
  onPublish: (scope: 'all' | 'selected') => void;
  onOpenInLibrary: (scope: 'all' | 'selected') => void;
  onToggleOutputSelection: (itemId: string) => void;
  onNavigate: (path: string) => void;
  onOpenPostModal: (ingredient: IIngredient | IIngredient[]) => void;
};

function getStatusClasses(status: WorkflowExecutionStatus): string {
  switch (status) {
    case WorkflowExecutionStatus.COMPLETED:
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
    case WorkflowExecutionStatus.RUNNING:
      return 'border-blue-500/30 bg-blue-500/15 text-blue-300';
    case WorkflowExecutionStatus.FAILED:
      return 'border-red-500/30 bg-red-500/15 text-red-300';
    default:
      return 'border-border-strong bg-muted/50 text-muted-foreground';
  }
}

function getProgressPercent(execution: BatchExecution): number {
  if (execution.totalCount <= 0) {
    return 0;
  }
  return Math.round(
    ((execution.completedCount + execution.failedCount) /
      execution.totalCount) *
      100,
  );
}

function getLibraryPathForCategory(category?: string): string | null {
  switch (category) {
    case 'image':
      return '/library/images';
    case 'video':
      return '/library/videos';
    case 'music':
      return '/library/music';
    default:
      return null;
  }
}

export default function BatchDetail({
  activeBatchStatus,
  availableOutputs,
  selectedOutputs,
  selectedOutputIds,
  isRunningBulkAction,
  workflowsById,
  onBackToComposer,
  onSelectAll,
  onClearSelection,
  onDownload,
  onPublish,
  onOpenInLibrary,
  onToggleOutputSelection,
  onNavigate,
  onOpenPostModal,
}: Props) {
  const t = useTranslations('pages.studioBatch');
  const completedOutputs = availableOutputs.length;
  const hasSelectedOutputs = selectedOutputs.length > 0;
  const outputsByItemId = useMemo(
    () =>
      new Map(
        availableOutputs.map((output) => [output.item.id, output.ingredient]),
      ),
    [availableOutputs],
  );

  return (
    <div className="space-y-6">
      <Card bodyClassName="gap-0 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {getWorkflowLabel(
                workflowsById.get(activeBatchStatus.workflowId)?.label,
              )}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">
              {t('detail.title')}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('detail.itemsProcessed', {
                processed:
                  activeBatchStatus.completedCount +
                  activeBatchStatus.failedCount,
                total: activeBatchStatus.totalCount,
              })}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={onBackToComposer}
              className="rounded-xl"
            >
              {t('detail.backToSetup')}
            </Button>
            <Badge
              className={getStatusClasses(activeBatchStatus.status)}
              variant="ghost"
            >
              {formatEnumLabel(activeBatchStatus.status)}
            </Badge>
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${getProgressPercent(activeBatchStatus)}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>
            {t('detail.completedCount', {
              count: activeBatchStatus.completedCount,
            })}
          </span>
          <span>
            {t('detail.failedCount', { count: activeBatchStatus.failedCount })}
          </span>
          <span>
            {t('detail.remainingCount', {
              count:
                activeBatchStatus.totalCount -
                activeBatchStatus.completedCount -
                activeBatchStatus.failedCount,
            })}
          </span>
          {activeBatchStatus.createdAt && (
            <span>
              {t('detail.started')}{' '}
              <ClientFormattedDate value={activeBatchStatus.createdAt} />
            </span>
          )}
        </div>
      </Card>

      <CollectionSection
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={onSelectAll}
              disabled={availableOutputs.length === 0}
              className="rounded-xl"
            >
              {t('detail.selectAll')}
            </Button>
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={onClearSelection}
              disabled={!hasSelectedOutputs}
              className="rounded-xl"
            >
              {t('detail.clearSelection')}
            </Button>
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={() => void onDownload('all')}
              disabled={availableOutputs.length === 0 || isRunningBulkAction}
              className="rounded-xl"
            >
              {t('detail.downloadAll')}
            </Button>
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={() => void onDownload('selected')}
              disabled={!hasSelectedOutputs || isRunningBulkAction}
              className="rounded-xl"
            >
              {t('detail.downloadSelected')}
            </Button>
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={() => onPublish('all')}
              disabled={availableOutputs.length === 0}
              className="rounded-xl"
            >
              {t('detail.publishAll')}
            </Button>
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={() => onPublish('selected')}
              disabled={!hasSelectedOutputs}
              className="rounded-xl"
            >
              {t('detail.publishSelected')}
            </Button>
            <Button
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              onClick={() =>
                onOpenInLibrary(hasSelectedOutputs ? 'selected' : 'all')
              }
              disabled={availableOutputs.length === 0}
              className="rounded-xl"
            >
              {t('detail.openInLibrary')}
            </Button>
          </div>
        }
        data-testid="batch-outputs-section"
        description={
          hasSelectedOutputs
            ? t('detail.outputsReadySelected', {
                count: completedOutputs,
                selected: selectedOutputs.length,
              })
            : t('detail.outputsReady', { count: completedOutputs })
        }
        itemCount={activeBatchStatus.items.length}
        title={t('detail.outputs')}
      >
        {isTerminalBatchStatus(activeBatchStatus.status) &&
          availableOutputs.length === 0 && (
            <InsetSurface
              className="border-dashed bg-background/40 px-4 py-6 text-sm text-muted-foreground"
              tone="default"
            >
              {t('detail.noOutputMetadata')}
            </InsetSurface>
          )}

        <CollectionGrid data-testid="batch-outputs-grid" maxColumns={3}>
          {activeBatchStatus.items.map((item) => {
            const ingredient = outputsByItemId.get(item.id) ?? null;
            const libraryPath = getLibraryPathForCategory(
              item.outputCategory ?? item.outputSummary?.category,
            );
            const isSelected = selectedOutputIds.has(item.id);

            return (
              <Card
                bodyClassName="gap-0 p-0"
                className="h-full overflow-hidden"
                data-testid={`batch-output-card-${item.id}`}
                key={item.id}
              >
                <div className="relative aspect-video bg-muted">
                  {ingredient?.thumbnailUrl ? (
                    <Image
                      src={ingredient.thumbnailUrl}
                      alt={t('detail.outputAlt', { id: ingredient.id })}
                      className="h-full w-full object-cover outline-media"
                      sizes="(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 100vw"
                      unoptimized={
                        !canOptimizeImageSource(ingredient.thumbnailUrl)
                      }
                      width={800}
                      height={600}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                      {item.outputSummary
                        ? t('detail.previewUnavailable')
                        : t('detail.noPreview')}
                    </div>
                  )}

                  {ingredient && (
                    <span
                      className={
                        'absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white' // design-system-allow-content-color
                      }
                    >
                      <Checkbox
                        aria-label={t('detail.selectOutput', { id: item.id })}
                        checked={isSelected}
                        onCheckedChange={() => onToggleOutputSelection(item.id)}
                      />
                      {t('detail.select')}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.outputSummary?.id ??
                          item.outputIngredientId ??
                          item.ingredientId}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t('detail.outputCategory', {
                          category:
                            item.outputCategory ??
                            item.outputSummary?.category ??
                            t('detail.unknownCategory'),
                        })}
                      </p>
                    </div>
                    <Badge
                      className={getStatusClasses(item.status)}
                      variant="ghost"
                    >
                      {formatEnumLabel(item.status)}
                    </Badge>
                  </div>

                  {item.error && (
                    <p className="text-xs text-destructive" role="alert">
                      {item.error}
                    </p>
                  )}

                  {!item.error &&
                    !item.outputSummary &&
                    item.status === WorkflowExecutionStatus.COMPLETED && (
                      <p className="text-xs text-warning">
                        {t('detail.missingOutputMetadata')}
                      </p>
                    )}

                  <CollectionItemActions
                    overflow={[
                      {
                        icon: <Download className="size-4" />,
                        id: 'download',
                        isDisabled: !ingredient,
                        label: t('detail.download'),
                        onSelect: () => {
                          if (ingredient) {
                            void downloadIngredient(ingredient);
                          }
                        },
                      },
                      {
                        icon: <FolderOpen className="size-4" />,
                        id: 'open-in-library',
                        isDisabled: !libraryPath,
                        label: t('detail.openInLibrary'),
                        onSelect: () => {
                          if (libraryPath) {
                            onNavigate(libraryPath);
                          }
                        },
                      },
                    ]}
                    primary={
                      <Button
                        variant={ButtonVariant.SECONDARY}
                        size={ButtonSize.XS}
                        onClick={() =>
                          ingredient && onOpenPostModal(ingredient)
                        }
                        disabled={!ingredient}
                        withWrapper={false}
                      >
                        {t('detail.publish')}
                      </Button>
                    }
                  />
                </div>
              </Card>
            );
          })}
        </CollectionGrid>
      </CollectionSection>
    </div>
  );
}
