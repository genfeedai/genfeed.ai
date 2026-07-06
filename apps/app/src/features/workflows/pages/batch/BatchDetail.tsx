'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { downloadIngredient } from '@helpers/media/download/download.helper';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import Image from 'next/image';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type {
  BatchItemStatus,
  BatchJobStatus,
  WorkflowSummary,
} from '@/features/workflows/services/workflow-api';

type OutputEntry = {
  ingredient: IIngredient;
  item: BatchItemStatus;
};

type Props = {
  activeBatchStatus: BatchJobStatus;
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

function getStatusClasses(status: string): string {
  switch (status) {
    case 'completed':
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
    case 'processing':
      return 'border-blue-500/30 bg-blue-500/15 text-blue-300';
    case 'failed':
      return 'border-red-500/30 bg-red-500/15 text-red-300';
    default:
      return 'border-white/15 bg-muted/50 text-white/70';
  }
}

function getProgressPercent(batchJob: BatchJobStatus): number {
  if (batchJob.totalCount <= 0) {
    return 0;
  }
  return Math.round(
    ((batchJob.completedCount + batchJob.failedCount) / batchJob.totalCount) *
      100,
  );
}

function isTerminalBatchStatus(status: string): boolean {
  return status === 'completed' || status === 'failed';
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

function getWorkflowLabel(
  workflowsById: Map<string, WorkflowSummary>,
  workflowId: string,
): string {
  return workflowsById.get(workflowId)?.name ?? workflowId;
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
  const completedOutputs = availableOutputs.length;
  const hasSelectedOutputs = selectedOutputs.length > 0;

  return (
    <div className="space-y-6">
      <Card bodyClassName="gap-0 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {getWorkflowLabel(workflowsById, activeBatchStatus.workflowId)}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-foreground">
              Batch Results
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {activeBatchStatus.completedCount + activeBatchStatus.failedCount}{' '}
              / {activeBatchStatus.totalCount} items processed
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant={ButtonVariant.OUTLINE}
              onClick={onBackToComposer}
              className="rounded-xl"
            >
              Back to batch setup
            </Button>
            <Badge
              className={getStatusClasses(activeBatchStatus.status)}
              variant="ghost"
            >
              {activeBatchStatus.status}
            </Badge>
          </div>
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${getProgressPercent(activeBatchStatus)}%` }}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>Completed: {activeBatchStatus.completedCount}</span>
          <span>Failed: {activeBatchStatus.failedCount}</span>
          <span>
            Remaining:{' '}
            {activeBatchStatus.totalCount -
              activeBatchStatus.completedCount -
              activeBatchStatus.failedCount}
          </span>
          {activeBatchStatus.createdAt && (
            <span>
              Started:{' '}
              <ClientFormattedDate value={activeBatchStatus.createdAt} />
            </span>
          )}
        </div>
      </Card>

      <Card bodyClassName="gap-0 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Outputs</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {completedOutputs} output{completedOutputs === 1 ? '' : 's'} ready
              {hasSelectedOutputs && `, ${selectedOutputs.length} selected`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.SM}
              onClick={onSelectAll}
              disabled={availableOutputs.length === 0}
              className="rounded-xl"
            >
              Select all
            </Button>
            <Button
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.SM}
              onClick={onClearSelection}
              disabled={!hasSelectedOutputs}
              className="rounded-xl"
            >
              Clear selection
            </Button>
            <Button
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.SM}
              onClick={() => void onDownload('all')}
              disabled={availableOutputs.length === 0 || isRunningBulkAction}
              className="rounded-xl"
            >
              Download all
            </Button>
            <Button
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.SM}
              onClick={() => void onDownload('selected')}
              disabled={!hasSelectedOutputs || isRunningBulkAction}
              className="rounded-xl"
            >
              Download selected
            </Button>
            <Button
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.SM}
              onClick={() => onPublish('all')}
              disabled={availableOutputs.length === 0}
              className="rounded-xl"
            >
              Publish all
            </Button>
            <Button
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.SM}
              onClick={() => onPublish('selected')}
              disabled={!hasSelectedOutputs}
              className="rounded-xl"
            >
              Publish selected
            </Button>
            <Button
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.SM}
              onClick={() =>
                onOpenInLibrary(hasSelectedOutputs ? 'selected' : 'all')
              }
              disabled={availableOutputs.length === 0}
              className="rounded-xl"
            >
              Open in library
            </Button>
          </div>
        </div>

        {isTerminalBatchStatus(activeBatchStatus.status) &&
          availableOutputs.length === 0 && (
            <InsetSurface
              className="mt-5 border-dashed bg-background/40 px-4 py-6 text-sm text-muted-foreground"
              tone="default"
            >
              This batch finished without persisted output metadata. Older jobs
              can still be inspected, but download and publish actions are only
              available for jobs that expose output summaries.
            </InsetSurface>
          )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {activeBatchStatus.items.map((item) => {
            const ingredient =
              availableOutputs.find((o) => o.item._id === item._id)
                ?.ingredient ?? null;
            const libraryPath = getLibraryPathForCategory(
              item.outputCategory ?? item.outputSummary?.category,
            );
            const isSelected = selectedOutputIds.has(item._id);

            return (
              <article
                key={item._id}
                className="overflow-hidden rounded-2xl border border-white/10 bg-background/50"
              >
                <div className="relative aspect-video bg-muted/50">
                  {ingredient?.thumbnailUrl ? (
                    <Image
                      unoptimized
                      src={ingredient.thumbnailUrl}
                      alt={`Output ${ingredient.id}`}
                      className="h-full w-full object-cover"
                      width={800}
                      height={600}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                      {item.outputSummary
                        ? 'Preview unavailable for this output type'
                        : 'No persisted output preview'}
                    </div>
                  )}

                  {ingredient && (
                    <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                      <Checkbox
                        aria-label={`Select output ${item._id}`}
                        checked={isSelected}
                        onCheckedChange={() =>
                          onToggleOutputSelection(item._id)
                        }
                      />
                      Select
                    </span>
                  )}
                </div>

                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {item.outputSummary?.id ??
                          item.outputIngredientId ??
                          item.ingredientId}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.outputCategory ??
                          item.outputSummary?.category ??
                          'unknown'}{' '}
                        output
                      </p>
                    </div>
                    <Badge
                      className={getStatusClasses(item.status)}
                      variant="ghost"
                    >
                      {item.status}
                    </Badge>
                  </div>

                  {item.error && (
                    <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                      {item.error}
                    </p>
                  )}

                  {!item.error &&
                    !item.outputSummary &&
                    item.status === 'completed' && (
                      <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                        Output metadata is unavailable for this completed item.
                      </p>
                    )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={ButtonVariant.OUTLINE}
                      size={ButtonSize.XS}
                      onClick={() =>
                        ingredient && void downloadIngredient(ingredient)
                      }
                      disabled={!ingredient}
                      className="rounded-xl"
                    >
                      Download
                    </Button>
                    <Button
                      variant={ButtonVariant.OUTLINE}
                      size={ButtonSize.XS}
                      onClick={() => ingredient && onOpenPostModal(ingredient)}
                      disabled={!ingredient}
                      className="rounded-xl"
                    >
                      Publish
                    </Button>
                    <Button
                      variant={ButtonVariant.OUTLINE}
                      size={ButtonSize.XS}
                      onClick={() => libraryPath && onNavigate(libraryPath)}
                      disabled={!libraryPath}
                      className="rounded-xl"
                    >
                      Open in library
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
