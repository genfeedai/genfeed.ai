'use client';

import {
  AssetScope,
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import {
  type BatchItemStatus,
  type BatchJobStatus,
  type BatchJobSummary,
  createWorkflowApiService,
  type WorkflowSummary,
} from '@genfeedai/workflow';
import { downloadIngredient } from '@helpers/media/download/download.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePostModal } from '@providers/global-modals/global-modals.provider';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';

interface UploadedFile {
  file: File;
  preview: string;
  ingredientId?: string;
}

const BATCH_POLL_INTERVAL_MS = 2000;

function isTerminalBatchStatus(status: string): boolean {
  return status === 'completed' || status === 'failed';
}

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

function getProgressPercent(
  batchJob: BatchJobStatus | BatchJobSummary,
): number {
  if (batchJob.totalCount <= 0) {
    return 0;
  }

  return Math.round(
    ((batchJob.completedCount + batchJob.failedCount) / batchJob.totalCount) *
      100,
  );
}

function mapBatchCategoryToIngredientCategory(
  category?: string,
): IngredientCategory | null {
  switch (category) {
    case IngredientCategory.IMAGE:
      return IngredientCategory.IMAGE;
    case IngredientCategory.VIDEO:
      return IngredientCategory.VIDEO;
    case IngredientCategory.MUSIC:
      return IngredientCategory.MUSIC;
    default:
      return null;
  }
}

function getLibraryPathForCategory(category?: string): string | null {
  switch (category) {
    case IngredientCategory.IMAGE:
      return '/library/images';
    case IngredientCategory.VIDEO:
      return '/library/videos';
    case IngredientCategory.MUSIC:
      return '/library/music';
    default:
      return null;
  }
}

function buildBatchIngredient(item: BatchItemStatus): IIngredient | null {
  const outputSummary = item.outputSummary;

  if (!outputSummary) {
    return null;
  }

  const category = mapBatchCategoryToIngredientCategory(
    item.outputCategory ?? outputSummary.category,
  );

  if (!category || !outputSummary.ingredientUrl) {
    return null;
  }

  const metadataLabel = `Batch output ${outputSummary.id.slice(-6)}`;

  return {
    _id: outputSummary.id,
    category,
    createdAt: item.completedAt ?? '',
    hasVoted: false,
    id: outputSummary.id,
    ingredientUrl: outputSummary.ingredientUrl,
    isDefault: false,
    isDeleted: false,
    isFavorite: false,
    isHighlighted: false,
    isVoteAnimating: false,
    metadata: { label: metadataLabel } as IMetadata,
    metadataLabel,
    organization: '',
    scope: AssetScope.USER,
    status:
      (outputSummary.status as IngredientStatus | undefined) ??
      IngredientStatus.GENERATED,
    thumbnailUrl: outputSummary.thumbnailUrl,
    totalChildren: 0,
    totalVotes: 0,
    updatedAt: item.completedAt ?? '',
    user: '',
  } as IIngredient;
}

function toBatchJobSummary(batchJob: BatchJobStatus): BatchJobSummary {
  return {
    _id: batchJob._id,
    completedCount: batchJob.completedCount,
    createdAt: batchJob.createdAt,
    failedCount: batchJob.failedCount,
    status: batchJob.status,
    totalCount: batchJob.totalCount,
    workflowId: batchJob.workflowId,
  };
}

function upsertRecentJob(
  previousJobs: BatchJobSummary[],
  batchJob: BatchJobStatus | BatchJobSummary,
): BatchJobSummary[] {
  const nextSummary =
    'items' in batchJob ? toBatchJobSummary(batchJob) : batchJob;
  const remainingJobs = previousJobs.filter(
    (job) => job._id !== nextSummary._id,
  );

  return [nextSummary, ...remainingJobs];
}

function getWorkflowLabel(
  workflowsById: Map<string, WorkflowSummary>,
  workflowId: string,
): string {
  return workflowsById.get(workflowId)?.name ?? workflowId;
}

export default function BatchWorkflowPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedJobId = searchParams?.get('job') ?? null;

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [recentJobs, setRecentJobs] = useState<BatchJobSummary[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [activeBatchStatus, setActiveBatchStatus] =
    useState<BatchJobStatus | null>(null);
  const [selectedOutputIds, setSelectedOutputIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingJob, setIsLoadingJob] = useState(false);
  const [isStartingBatch, setIsStartingBatch] = useState(false);
  const [isRunningBulkAction, setIsRunningBulkAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef(files);

  const getService = useAuthedService(createWorkflowApiService);
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance('images', token),
  );
  const { openPostBatchModal } = usePostModal();

  const workflowsById = useMemo(
    () => new Map(workflows.map((workflow) => [workflow._id, workflow])),
    [workflows],
  );

  const availableOutputs = useMemo(
    () =>
      activeBatchStatus?.items
        .map((item) => ({
          ingredient: buildBatchIngredient(item),
          item,
        }))
        .filter(
          (
            entry,
          ): entry is { ingredient: IIngredient; item: BatchItemStatus } =>
            entry.ingredient !== null,
        ) ?? [],
    [activeBatchStatus],
  );

  const selectedOutputs = useMemo(
    () =>
      availableOutputs.filter(({ item }) => selectedOutputIds.has(item._id)),
    [availableOutputs, selectedOutputIds],
  );

  const hasPendingUploads = files.some((file) => !file.ingredientId);
  const canRunBatch =
    selectedWorkflowId.length > 0 &&
    files.length > 0 &&
    !hasPendingUploads &&
    !isStartingBatch;

  const replaceJobQuery = useCallback(
    (batchJobId: string | null) => {
      const nextSearchParams = new URLSearchParams(searchParams?.toString());

      if (batchJobId) {
        nextSearchParams.set('job', batchJobId);
      } else {
        nextSearchParams.delete('job');
      }

      const query = nextSearchParams.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const loadBatchJob = useCallback(
    async (batchJobId: string) => {
      setIsLoadingJob(true);

      try {
        const service = await getService();
        const batchJob = await service.getBatchStatus(batchJobId);

        setActiveBatchStatus(batchJob);
        setRecentJobs((previousJobs) =>
          upsertRecentJob(previousJobs, batchJob),
        );
        setSelectedWorkflowId(batchJob.workflowId);
      } catch (jobError) {
        const message =
          jobError instanceof Error
            ? jobError.message
            : 'Failed to load batch job.';
        setError(message);
        logger.error('Failed to load batch job', {
          batchJobId,
          error: jobError,
        });
      } finally {
        setIsLoadingJob(false);
      }
    },
    [getService],
  );

  useEffect(() => {
    fileRef.current = files;
  }, [files]);

  useEffect(() => {
    return () => {
      for (const file of fileRef.current) {
        URL.revokeObjectURL(file.preview);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadInitialData = async () => {
      try {
        setIsBootstrapping(true);
        const service = await getService();
        const [workflowData, batchJobs] = await Promise.all([
          service.list(),
          service.listBatchJobs(),
        ]);

        if (cancelled) {
          return;
        }

        setWorkflows(workflowData);
        setRecentJobs(batchJobs);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const message =
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load batch workflow data.';
        setError(message);
        logger.error('Failed to load batch workflow page', {
          error: loadError,
        });
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void loadInitialData();

    return () => {
      cancelled = true;
    };
  }, [getService]);

  useEffect(() => {
    if (!requestedJobId || requestedJobId === activeBatchStatus?._id) {
      return;
    }

    void loadBatchJob(requestedJobId);
  }, [activeBatchStatus?._id, loadBatchJob, requestedJobId]);

  useEffect(() => {
    if (!activeBatchStatus || isTerminalBatchStatus(activeBatchStatus.status)) {
      return;
    }

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const service = await getService();
        const nextBatchStatus = await service.getBatchStatus(
          activeBatchStatus._id,
        );

        if (cancelled) {
          return;
        }

        setActiveBatchStatus(nextBatchStatus);
        setRecentJobs((previousJobs) =>
          upsertRecentJob(previousJobs, nextBatchStatus),
        );
      } catch (pollError) {
        if (!cancelled) {
          logger.error('Failed to poll batch status', {
            batchJobId: activeBatchStatus._id,
            error: pollError,
          });
        }
      }
    }, BATCH_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeBatchStatus?._id, activeBatchStatus?.status, getService]);

  useEffect(() => {
    const selectableIds = new Set(availableOutputs.map(({ item }) => item._id));

    setSelectedOutputIds((previousIds) => {
      const nextIds = [...previousIds].filter((itemId) =>
        selectableIds.has(itemId),
      );
      return nextIds.length === previousIds.size
        ? previousIds
        : new Set(nextIds);
    });
  }, [availableOutputs]);

  const clearFiles = useCallback(() => {
    setFiles((previousFiles) => {
      for (const file of previousFiles) {
        URL.revokeObjectURL(file.preview);
      }
      return [];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((previousFiles) => {
      const nextFiles = [...previousFiles];
      const [removedFile] = nextFiles.splice(index, 1);

      if (removedFile) {
        URL.revokeObjectURL(removedFile.preview);
      }

      return nextFiles;
    });
  }, []);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const pendingFiles = acceptedFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));

      setFiles((previousFiles) => [...previousFiles, ...pendingFiles]);

      try {
        const ingredientsService = await getIngredientsService();

        for (const pendingFile of pendingFiles) {
          try {
            const formData = new FormData();
            formData.append('file', pendingFile.file);
            formData.append('category', 'images');

            const ingredient = await ingredientsService.postUpload(formData);
            const ingredientId = (ingredient as { _id: string })._id;

            setFiles((previousFiles) =>
              previousFiles.map((file) =>
                file.preview === pendingFile.preview
                  ? {
                      ...file,
                      ingredientId,
                    }
                  : file,
              ),
            );
          } catch (uploadError) {
            logger.error('Failed to upload batch image ingredient', {
              error: uploadError,
              fileName: pendingFile.file.name,
            });
          }
        }
      } catch (ingredientsError) {
        logger.error('Failed to access ingredients service', {
          error: ingredientsError,
        });
      }
    },
    [getIngredientsService],
  );

  const { getInputProps, getRootProps, isDragActive } = useDropzone({
    accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
    maxFiles: 100,
    multiple: true,
    onDrop,
  });

  const handleRunBatch = useCallback(async () => {
    if (!canRunBatch) {
      return;
    }

    const ingredientIds = files
      .map((file) => file.ingredientId)
      .filter((ingredientId): ingredientId is string => Boolean(ingredientId));

    if (ingredientIds.length === 0) {
      setError(
        'Images are still uploading. Wait for uploads to finish before running the batch.',
      );
      return;
    }

    try {
      setError(null);
      setIsStartingBatch(true);

      const service = await getService();
      const result = await service.runBatch(selectedWorkflowId, ingredientIds);
      const batchJob = await service.getBatchStatus(result.batchJobId);

      setActiveBatchStatus(batchJob);
      setRecentJobs((previousJobs) => upsertRecentJob(previousJobs, batchJob));
      setSelectedOutputIds(new Set());
      replaceJobQuery(result.batchJobId);
    } catch (runError) {
      const message =
        runError instanceof Error ? runError.message : 'Failed to start batch.';
      setError(message);
      logger.error('Failed to start batch workflow run', { error: runError });
    } finally {
      setIsStartingBatch(false);
    }
  }, [canRunBatch, files, getService, replaceJobQuery, selectedWorkflowId]);

  const handleOpenRecentJob = useCallback(
    async (batchJobId: string) => {
      setError(null);
      replaceJobQuery(batchJobId);
      await loadBatchJob(batchJobId);
    },
    [loadBatchJob, replaceJobQuery],
  );

  const handleBackToComposer = useCallback(() => {
    setActiveBatchStatus(null);
    setSelectedOutputIds(new Set());
    setError(null);
    replaceJobQuery(null);
  }, [replaceJobQuery]);

  const toggleOutputSelection = useCallback((itemId: string) => {
    setSelectedOutputIds((previousIds) => {
      const nextIds = new Set(previousIds);

      if (nextIds.has(itemId)) {
        nextIds.delete(itemId);
      } else {
        nextIds.add(itemId);
      }

      return nextIds;
    });
  }, []);

  const handlePublish = useCallback(
    (scope: 'all' | 'selected') => {
      const ingredients =
        scope === 'selected'
          ? selectedOutputs.map(({ ingredient }) => ingredient)
          : availableOutputs.map(({ ingredient }) => ingredient);

      if (ingredients.length === 0) {
        return;
      }

      openPostBatchModal(scope === 'selected' ? ingredients : ingredients);
    },
    [availableOutputs, openPostBatchModal, selectedOutputs],
  );

  const handleDownload = useCallback(
    async (scope: 'all' | 'selected') => {
      const ingredients =
        scope === 'selected'
          ? selectedOutputs.map(({ ingredient }) => ingredient)
          : availableOutputs.map(({ ingredient }) => ingredient);

      if (ingredients.length === 0) {
        return;
      }

      setIsRunningBulkAction(true);
      setError(null);

      try {
        for (const ingredient of ingredients) {
          await downloadIngredient(ingredient);
        }
      } catch (downloadError) {
        const message =
          downloadError instanceof Error
            ? downloadError.message
            : 'Failed to download outputs.';
        setError(message);
        logger.error('Failed to download batch outputs', {
          error: downloadError,
        });
      } finally {
        setIsRunningBulkAction(false);
      }
    },
    [availableOutputs, selectedOutputs],
  );

  const handleOpenInLibrary = useCallback(
    (scope: 'all' | 'selected') => {
      const items =
        scope === 'selected'
          ? selectedOutputs.map(({ item }) => item)
          : availableOutputs.map(({ item }) => item);

      if (items.length === 0) {
        return;
      }

      const libraryPaths = new Set(
        items
          .map((item) =>
            getLibraryPathForCategory(
              item.outputCategory ?? item.outputSummary?.category,
            ),
          )
          .filter((path): path is string => Boolean(path)),
      );

      if (libraryPaths.size !== 1) {
        setError(
          'Selected outputs span multiple library categories. Narrow the selection to one output type first.',
        );
        return;
      }

      router.push([...libraryPaths][0]);
    },
    [availableOutputs, router, selectedOutputs],
  );

  const renderComposer = () => (
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
                onValueChange={setSelectedWorkflowId}
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
              onClick={handleRunBatch}
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
              <input type="file" {...getInputProps()} />
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
                <svg
                  aria-hidden="true"
                  className="h-8 w-8 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
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
                    onClick={clearFiles}
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
                      <img
                        src={file.preview}
                        alt={file.file.name}
                        className={`aspect-square w-full object-cover ${
                          file.ingredientId ? '' : 'opacity-60'
                        }`}
                      />
                      <Button
                        variant={ButtonVariant.UNSTYLED}
                        size={ButtonSize.XS}
                        onClick={() => removeFile(index)}
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
                onClick={() => void handleOpenRecentJob(job._id)}
                className="w-full rounded-xl border border-white/10 bg-background/40 px-4 py-4 text-left transition hover:border-white/20 hover:bg-background/60"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {getWorkflowLabel(workflowsById, job.workflowId)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {job.createdAt
                        ? new Date(job.createdAt).toLocaleString()
                        : 'Unknown start time'}
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

  const renderBatchDetail = () => {
    if (!activeBatchStatus) {
      return null;
    }

    const completedOutputs = availableOutputs.length;
    const hasSelectedOutputs = selectedOutputs.length > 0;

    return (
      <div className="space-y-6">
        <Card
          bodyClassName="gap-0 p-6"
          className="border-white/10 bg-card/95 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                {getWorkflowLabel(workflowsById, activeBatchStatus.workflowId)}
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-foreground">
                Batch Results
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {activeBatchStatus.completedCount +
                  activeBatchStatus.failedCount}{' '}
                / {activeBatchStatus.totalCount} items processed
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant={ButtonVariant.OUTLINE}
                onClick={handleBackToComposer}
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

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/8">
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
                {new Date(activeBatchStatus.createdAt).toLocaleString()}
              </span>
            )}
          </div>
        </Card>

        <Card
          bodyClassName="gap-0 p-6"
          className="border-white/10 bg-card/95 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Outputs</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {completedOutputs} output{completedOutputs === 1 ? '' : 's'}{' '}
                ready
                {hasSelectedOutputs && `, ${selectedOutputs.length} selected`}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.SM}
                onClick={() =>
                  setSelectedOutputIds(
                    new Set(availableOutputs.map(({ item }) => item._id)),
                  )
                }
                disabled={availableOutputs.length === 0}
                className="rounded-xl"
              >
                Select all
              </Button>
              <Button
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.SM}
                onClick={() => setSelectedOutputIds(new Set())}
                disabled={!hasSelectedOutputs}
                className="rounded-xl"
              >
                Clear selection
              </Button>
              <Button
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.SM}
                onClick={() => void handleDownload('all')}
                disabled={availableOutputs.length === 0 || isRunningBulkAction}
                className="rounded-xl"
              >
                Download all
              </Button>
              <Button
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.SM}
                onClick={() => void handleDownload('selected')}
                disabled={!hasSelectedOutputs || isRunningBulkAction}
                className="rounded-xl"
              >
                Download selected
              </Button>
              <Button
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.SM}
                onClick={() => handlePublish('all')}
                disabled={availableOutputs.length === 0}
                className="rounded-xl"
              >
                Publish all
              </Button>
              <Button
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.SM}
                onClick={() => handlePublish('selected')}
                disabled={!hasSelectedOutputs}
                className="rounded-xl"
              >
                Publish selected
              </Button>
              <Button
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.SM}
                onClick={() =>
                  handleOpenInLibrary(hasSelectedOutputs ? 'selected' : 'all')
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
                This batch finished without persisted output metadata. Older
                jobs can still be inspected, but download and publish actions
                are only available for jobs that expose output summaries.
              </InsetSurface>
            )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {activeBatchStatus.items.map((item) => {
              const ingredient = buildBatchIngredient(item);
              const libraryPath = getLibraryPathForCategory(
                item.outputCategory ?? item.outputSummary?.category,
              );
              const isSelected = selectedOutputIds.has(item._id);

              return (
                <article
                  key={item._id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-background/50"
                >
                  <div className="relative aspect-video bg-white/5">
                    {ingredient?.thumbnailUrl ? (
                      <img
                        src={ingredient.thumbnailUrl}
                        alt={`Output ${ingredient.id}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
                        {item.outputSummary
                          ? 'Preview unavailable for this output type'
                          : 'No persisted output preview'}
                      </div>
                    )}

                    {ingredient && (
                      <label className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                        <Checkbox
                          aria-label={`Select output ${item._id}`}
                          checked={isSelected}
                          onCheckedChange={() =>
                            toggleOutputSelection(item._id)
                          }
                        />
                        Select
                      </label>
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
                          Output metadata is unavailable for this completed
                          item.
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
                        onClick={() =>
                          ingredient && openPostBatchModal(ingredient)
                        }
                        disabled={!ingredient}
                        className="rounded-xl"
                      >
                        Publish
                      </Button>
                      <Button
                        variant={ButtonVariant.OUTLINE}
                        size={ButtonSize.XS}
                        onClick={() => libraryPath && router.push(libraryPath)}
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
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-white/8 bg-card px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Batch Workflow Runner
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload images, run one workflow across all of them, and return to
              any batch job later.
            </p>
          </div>

          {activeBatchStatus && (
            <Button
              variant={ButtonVariant.OUTLINE}
              onClick={handleBackToComposer}
              className="rounded-xl"
            >
              New batch
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {(isBootstrapping || isLoadingJob) && (
          <div className="mb-6 rounded-xl border border-white/10 bg-card/80 px-4 py-3 text-sm text-muted-foreground">
            {isLoadingJob
              ? 'Loading batch job…'
              : 'Loading workflows and recent jobs…'}
          </div>
        )}

        {activeBatchStatus ? renderBatchDetail() : renderComposer()}
      </main>
    </div>
  );
}
