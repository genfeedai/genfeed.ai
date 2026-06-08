import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import { downloadIngredient } from '@helpers/media/download/download.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { usePostModal } from '@providers/global-modals/global-modals.provider';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import type {
  BatchItemStatus,
  BatchJobStatus,
  BatchJobSummary,
  WorkflowSummary,
} from '@/features/workflows/services/workflow-api';
import { createWorkflowApiService } from '@/features/workflows/services/workflow-api';

interface UploadedFile {
  file: File;
  preview: string;
  ingredientId?: string;
}

const BATCH_POLL_INTERVAL_MS = 2000;

function isTerminalBatchStatus(status: string): boolean {
  return status === 'completed' || status === 'failed';
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

export function useBatchWorkflowPage() {
  const { push, replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const requestedJobId = searchParams.get('job') ?? null;

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
  const fileRef = useRef<UploadedFile[]>(files);

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
      (activeBatchStatus?.items ?? []).reduce<
        { ingredient: IIngredient; item: BatchItemStatus }[]
      >((outputs, item) => {
        const ingredient = buildBatchIngredient(item);
        if (ingredient) {
          outputs.push({ ingredient, item });
        }
        return outputs;
      }, []),
    [activeBatchStatus?.items],
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
      const nextSearchParams = new URLSearchParams(searchParamsString);

      if (batchJobId) {
        nextSearchParams.set('job', batchJobId);
      } else {
        nextSearchParams.delete('job');
      }

      const query = nextSearchParams.toString();
      replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, replace, searchParamsString],
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

  const activeBatchId = activeBatchStatus?._id;
  const activeBatchLifecycleStatus = activeBatchStatus?.status;

  useEffect(() => {
    if (!activeBatchId || !activeBatchLifecycleStatus) {
      return;
    }

    if (isTerminalBatchStatus(activeBatchLifecycleStatus)) {
      return;
    }

    let cancelled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const service = await getService();
        const nextBatchStatus = await service.getBatchStatus(activeBatchId);

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
            batchJobId: activeBatchId,
            error: pollError,
          });
        }
      }
    }, BATCH_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeBatchId, activeBatchLifecycleStatus, getService]);

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

    const ingredientIds = files.reduce<string[]>((ids, file) => {
      if (file.ingredientId) {
        ids.push(file.ingredientId);
      }
      return ids;
    }, []);

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

      const libraryPaths = items.reduce<Set<string>>((paths, item) => {
        const path = getLibraryPathForCategory(
          item.outputCategory ?? item.outputSummary?.category,
        );
        if (path) {
          paths.add(path);
        }
        return paths;
      }, new Set());

      if (libraryPaths.size !== 1) {
        setError(
          'Selected outputs span multiple library categories. Narrow the selection to one output type first.',
        );
        return;
      }

      push([...libraryPaths][0]);
    },
    [availableOutputs, push, selectedOutputs],
  );

  return {
    activeBatchStatus,
    availableOutputs,
    canRunBatch,
    clearFiles,
    error,
    files,
    getInputProps,
    getRootProps,
    handleBackToComposer,
    handleDownload,
    handleOpenInLibrary,
    handleOpenRecentJob,
    handlePublish,
    handleRunBatch,
    hasPendingUploads,
    isDragActive,
    isBootstrapping,
    isLoadingJob,
    isRunningBulkAction,
    isStartingBatch,
    openPostBatchModal,
    push,
    recentJobs,
    removeFile,
    selectedOutputIds,
    selectedOutputs,
    selectedWorkflowId,
    setSelectedOutputIds,
    setSelectedWorkflowId,
    toggleOutputSelection,
    workflows,
    workflowsById,
  };
}
