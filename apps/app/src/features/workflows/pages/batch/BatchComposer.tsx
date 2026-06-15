'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
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
  BatchJobSummary,
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
  recentJobs: BatchJobSummary[];
  workflowsById: Map<string, WorkflowSummary>;
  onOpenRecentJob: (batchJobId: string) => void;
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
      return 'border-white/15 bg-white/5 text-white/70';
  }
}

function getProgressPercent(job: BatchJobSummary): number {
  if (job.totalCount <= 0) {
    return 0;
  }
  return Math.round(
    ((job.completedCount + job.failedCount) / job.totalCount) * 100,
  );
}

function getWorkflowLabel(
  workflowsById: Map<string, WorkflowSummary>,
  workflowId: string,
): string {
  return workflowsById.get(workflowId)?.name ?? workflowId;
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
  recentJobs,
  workflowsById,
  onOpenRecentJob,
}: Props) {
  const { canRun: canRunBatch, isStarting: isStartingBatch } = batchRunState;
  const { hasPendingUploads, isDragActive } = dropzoneState;
  return (
    <div className="space-y-8">
      <Card
        bodyClassName="gap-0 p-6"
        className="border-white/10 bg-card/95 shadow-sm"
      >
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
                    <SelectItem key={workflow._id} value={workflow._id}>
                      {workflow.name || workflow._id}
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
                  : 'border-white/15 bg-background/40 hover:border-white/25'
              }`}
            >
              <Input type="file" {...getInputProps()} />
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-white/5">
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
                          ? 'border-white/10'
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
                        className="absolute right-2 top-2 hidden rounded-full bg-black/60 px-2 py-1 text-xs text-white group-hover:block"
                      >
                        Remove
                      </Button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 text-[11px] text-white">
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

      <Card
        bodyClassName="gap-0 p-6"
        className="border-white/10 bg-card/95 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Recent jobs
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Reopen a batch, resume progress, or inspect completed results.
            </p>
          </div>
        </div>

        {recentJobs.length === 0 ? (
          <InsetSurface
            className="border-dashed bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground"
            tone="default"
          >
            No recent batch jobs yet.
          </InsetSurface>
        ) : (
          <div className="space-y-3">
            {recentJobs.map((job) => (
              <Button
                key={job._id}
                variant={ButtonVariant.UNSTYLED}
                onClick={() => void onOpenRecentJob(job._id)}
                className="w-full rounded-xl border border-white/10 bg-background/40 p-4 text-left transition hover:border-white/20 hover:bg-background/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {getWorkflowLabel(workflowsById, job.workflowId)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <ClientFormattedDate
                        fallback="Unknown start time"
                        value={job.createdAt}
                      />
                    </p>
                  </div>
                  <Badge
                    className={getStatusClasses(job.status)}
                    variant="ghost"
                  >
                    {job.status}
                  </Badge>
                </div>
                <div className="mt-4">
                  <div className="h-2 overflow-hidden rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${getProgressPercent(job)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {job.completedCount + job.failedCount} / {job.totalCount}{' '}
                    processed
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
