'use client';

import {
  ButtonSize,
  ButtonVariant,
  formatEnumLabel,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import Image from 'next/image';
import type { DropzoneInputProps, DropzoneRootProps } from 'react-dropzone';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type {
  BatchExecutionSummary,
  WorkflowSummary,
} from '@/features/workflows/services/workflow-api';

type UploadedFile = {
  file: File;
  preview: string;
  ingredientId?: string;
};

type BatchRunState = {
  canRun: boolean;
  isStarting: boolean;
};

type DropzoneState = {
  hasPendingUploads: boolean;
  isDragActive: boolean;
};

type Props = {
  workflows: WorkflowSummary[];
  selectedWorkflowId: string;
  onWorkflowChange: (workflowId: string) => void;
  files: UploadedFile[];
  batchRunState: BatchRunState;
  onRunBatch: () => void;
  getRootProps: (props?: DropzoneRootProps) => DropzoneRootProps;
  getInputProps: (props?: DropzoneInputProps) => DropzoneInputProps;
  dropzoneState: DropzoneState;
  onClearFiles: () => void;
  onRemoveFile: (index: number) => void;
  recentExecutions: BatchExecutionSummary[];
  workflowsById: Map<string, WorkflowSummary>;
  onOpenRecentExecution: (executionId: string) => void;
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

function getProgressPercent(execution: BatchExecutionSummary): number {
  if (execution.totalCount <= 0) {
    return 0;
  }
  return Math.round(
    ((execution.completedCount + execution.failedCount) /
      execution.totalCount) *
      100,
  );
}

function getWorkflowLabel(
  workflowsById: Map<string, WorkflowSummary>,
  workflowId: string,
): string {
  return workflowsById.get(workflowId)?.label ?? workflowId;
}

export default function BatchComposer({
  workflows,
  selectedWorkflowId,
  onWorkflowChange,
  files,
  batchRunState,
  onRunBatch,
  getRootProps,
  getInputProps,
  dropzoneState,
  onClearFiles,
  onRemoveFile,
  recentExecutions,
  workflowsById,
  onOpenRecentExecution,
}: Props) {
  const { canRun: canRunBatch, isStarting: isStartingBatch } = batchRunState;
  const { hasPendingUploads, isDragActive } = dropzoneState;
  return (
    <div className="space-y-8">
      <Card bodyClassName="gap-0 p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,320px)_1fr]">
          <div className="space-y-6">
            <div>
              <label
                htmlFor="workflow-select"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Select workflow
              </label>
              <Select
                value={selectedWorkflowId}
                onValueChange={onWorkflowChange}
              >
                <SelectTrigger id="workflow-select">
                  <SelectValue placeholder="Choose a workflow…" />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((workflow) => (
                    <SelectItem key={workflow.id} value={workflow.id}>
                      {workflow.label || workflow.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <InsetSurface
              className="text-sm text-muted-foreground"
              tone="muted"
            >
              <p className="font-medium text-foreground">Batch flow</p>
              <p className="mt-2">1. Upload images.</p>
              <p>2. Pick a workflow.</p>
              <p>3. Run once and come back later with the batch URL.</p>
            </InsetSurface>

            <Button
              variant={ButtonVariant.DEFAULT}
              onClick={onRunBatch}
              disabled={!canRunBatch}
              className="w-full rounded-xl"
            >
              {isStartingBatch
                ? 'Starting batch…'
                : `Run Batch (${files.length})`}
            </Button>
          </div>

          <div className="space-y-5">
            <div
              {...getRootProps()}
              className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
                isDragActive
                  ? 'border-primary bg-primary/8'
                  : 'border-border bg-background/40 hover:border-border-strong'
              }`}
            >
              <Input type="file" {...getInputProps()} />
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-muted/50">
                <svg
                  aria-hidden="true"
                  className="size-8 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <title>Upload</title>
                  <path
                    d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="text-sm text-foreground">
                {isDragActive
                  ? 'Drop images here…'
                  : 'Drag and drop images here, or click to browse'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                JPG, PNG, WebP. Maximum 100 images per batch.
              </p>
            </div>

            {files.length > 0 && (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {files.length} image{files.length === 1 ? '' : 's'} selected
                    {hasPendingUploads && (
                      <span className="ml-2 text-amber-300">
                        {files.filter((file) => !file.ingredientId).length}{' '}
                        uploading…
                      </span>
                    )}
                  </p>
                  <Button
                    variant={ButtonVariant.GHOST}
                    onClick={onClearFiles}
                    className="text-red-300 hover:text-red-200"
                  >
                    Clear all
                  </Button>
                </div>

                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
                  {files.map((file, index) => (
                    <div
                      key={file.preview}
                      className={`group relative overflow-hidden rounded-xl border ${
                        file.ingredientId
                          ? 'border-border'
                          : 'border-amber-500/40'
                      } bg-background/60`}
                    >
                      <Image
                        unoptimized
                        src={file.preview}
                        alt={file.file.name}
                        className={`aspect-square w-full object-cover ${
                          file.ingredientId ? '' : 'opacity-60'
                        }`}
                        width={800}
                        height={600}
                      />
                      <Button
                        variant={ButtonVariant.UNSTYLED}
                        size={ButtonSize.XS}
                        onClick={() => onRemoveFile(index)}
                        className={
                          'absolute right-2 top-2 hidden rounded-full bg-black/60 px-2 py-1 text-xs text-white group-hover:block' // design-system-allow-content-color
                        }
                      >
                        Remove
                      </Button>
                      <div
                        className={
                          'absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-2xs text-white' // design-system-allow-content-color
                        }
                      >
                        {file.ingredientId ? 'Uploaded' : 'Uploading…'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card bodyClassName="gap-0 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Recent executions
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reopen a batch, resume progress, or inspect completed results.
            </p>
          </div>
        </div>

        {recentExecutions.length === 0 ? (
          <InsetSurface
            className="border-dashed bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground"
            tone="default"
          >
            No recent batch executions yet.
          </InsetSurface>
        ) : (
          <div className="divide-y divide-border/80">
            {recentExecutions.map((execution) => (
              <Button
                key={execution.id}
                variant={ButtonVariant.UNSTYLED}
                onClick={() => void onOpenRecentExecution(execution.id)}
                className="w-full py-4 text-left transition hover:bg-foreground/[0.03]"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {getWorkflowLabel(workflowsById, execution.workflowId)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <ClientFormattedDate
                        fallback="Unknown start time"
                        value={execution.createdAt}
                      />
                    </p>
                  </div>
                  <Badge
                    className={getStatusClasses(execution.status)}
                    variant="ghost"
                  >
                    {formatEnumLabel(execution.status)}
                  </Badge>
                </div>
                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width]"
                      style={{ width: `${getProgressPercent(execution)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {execution.completedCount + execution.failedCount} /{' '}
                    {execution.totalCount} processed
                  </p>
                </div>
              </Button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
