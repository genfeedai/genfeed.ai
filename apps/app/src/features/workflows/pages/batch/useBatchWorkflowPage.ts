import {
  AssetScope,
  IngredientCategory,
  IngredientStatus,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import type { IIngredient, IMetadata } from '@genfeedai/contracts/interfaces';
import { downloadIngredient } from '@helpers/media/download/download.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useVisiblePolling } from '@hooks/ui/use-visible-polling/use-visible-polling';
import { usePostModal } from '@providers/global-modals/global-modals.provider';
import { IngredientsService } from '@services/content/ingredients.service';
import { logger } from '@services/core/logger.service';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import type {
  BatchExecution,
  BatchExecutionItem,
  BatchExecutionSummary,
  WorkflowSummary,
} from '@/features/workflows/services/workflow-api';
import { createWorkflowApiService } from '@/features/workflows/services/workflow-api';
import {
  toBatchExecution,
  toBatchExecutionSummary,
} from '@/features/workflows/utils/batch-execution';
import { isTerminalBatchStatus } from '@/features/workflows/utils/batch-status';
import { ANALYTICS_EVENTS, captureAnalyticsEvent } from '@/lib/analytics';

interface UploadedFile {
  file: File;
  preview: string;
  ingredientId?: string;
}

const BATCH_POLL_INTERVAL_MS = 2000;
const BATCH_UPLOAD_CONCURRENCY = 4;

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

function buildBatchIngredient(item: BatchExecutionItem): IIngredient | null {
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
    scope: AssetScope.USER,
    status: outputSummary.status ?? IngredientStatus.GENERATED,
    thumbnailUrl: outputSummary.thumbnailUrl,
    totalChildren: 0,
    totalVotes: 0,
    updatedAt: item.completedAt ?? '',
  } as IIngredient;
}

function toExecutionSummary(execution: BatchExecution): BatchExecutionSummary {
  return {
    id: execution.id,
    completedCount: execution.completedCount,
    createdAt: execution.createdAt,
    failedCount: execution.failedCount,
    status: execution.status,
    totalCount: execution.totalCount,
    workflowId: execution.workflowId,
  };
}

function upsertRecentExecution(
  previousExecutions: BatchExecutionSummary[],
  execution: BatchExecution | BatchExecutionSummary,
): BatchExecutionSummary[] {
  const nextSummary =
    'items' in execution ? toExecutionSummary(execution) : execution;
  const remainingExecutions = previousExecutions.filter(
    (candidate) => candidate.id !== nextSummary.id,
  );

  return [nextSummary, ...remainingExecutions];
}

export function useBatchWorkflowPage() {
  const { push, replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const requestedExecutionId = searchParams.get('execution') ?? null;

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<
    BatchExecutionSummary[]
  >([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [activeBatchStatus, setActiveBatchStatus] =
    useState<BatchExecution | null>(null);
  const [selectedOutputIds, setSelectedOutputIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingExecution, setIsLoadingExecution] = useState(false);
  const [isStartingBatch, setIsStartingBatch] = useState(false);
  const [isRunningBulkAction, setIsRunningBulkAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<UploadedFile[]>(files);
  const startedBatchExecutionIdRef = useRef<string | null>(null);

  const getService = useAuthedService(createWorkflowApiService);
  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance('images', token),
  );
  const { openPostBatchModal } = usePostModal();

  const workflowsById = useMemo(
    () => new Map(workflows.map((workflow) => [workflow.id, workflow])),
    [workflows],
  );

  const availableOutputs = useMemo(
    () =>
      (activeBatchStatus?.items ?? []).reduce<
        { ingredient: IIngredient; item: BatchExecutionItem }[]
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
    () => availableOutputs.filter(({ item }) => selectedOutputIds.has(item.id)),
    [availableOutputs, selectedOutputIds],
  );

  const hasPendingUploads = files.some((file) => !file.ingredientId);
  const canRunBatch =
    selectedWorkflowId.length > 0 &&
    files.length > 0 &&
    !hasPendingUploads &&
    !isStartingBatch;

  const replaceExecutionQuery = useCallback(
    (executionId: string | null) => {
      const nextSearchParams = new URLSearchParams(searchParamsString);

      if (executionId) {
        nextSearchParams.set('execution', executionId);
      } else {
        nextSearchParams.delete('execution');
      }

      const query = nextSearchParams.toString();
      replace(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, replace, searchParamsString],
  );

  const loadBatchExecution = useCallback(
    async (executionId: string) => {
      setIsLoadingExecution(true);

      try {
        const service = await getService();
        const document = await service.getExecution(executionId);
        const batchExecution = toBatchExecution(document);
        if (!batchExecution) {
          throw new Error('Execution is not a workflow batch');
        }

        setActiveBatchStatus(batchExecution);
        setRecentExecutions((previousExecutions) =>
          upsertRecentExecution(previousExecutions, batchExecution),
        );
        setSelectedWorkflowId(batchExecution.workflowId);
      } catch (executionError) {
        const message =
          executionError instanceof Error
            ? executionError.message
            : 'Failed to load batch execution.';
        setError(message);
        logger.error('Failed to load batch execution', {
          executionId,
          error: executionError,
        });
      } finally {
        setIsLoadingExecution(false);
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
        const [workflowData, executions] = await Promise.all([
          service.list(),
          service.listExecutions({ limit: 100 }),
        ]);

        if (cancelled) {
          return;
        }

        setWorkflows(workflowData);
        setRecentExecutions(
          executions.flatMap((execution) => {
            const summary = toBatchExecutionSummary(execution);
            return summary ? [summary] : [];
          }),
        );
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
    if (
      !requestedExecutionId ||
      requestedExecutionId === activeBatchStatus?.id
    ) {
      return;
    }

    void loadBatchExecution(requestedExecutionId);
  }, [activeBatchStatus?.id, loadBatchExecution, requestedExecutionId]);

  const activeBatchId = activeBatchStatus?.id;
  const activeBatchLifecycleStatus = activeBatchStatus?.status;

  const polledBatchIdRef = useRef(activeBatchId);
  polledBatchIdRef.current = activeBatchId;

  useEffect(() => {
    if (
      !activeBatchId ||
      startedBatchExecutionIdRef.current !== activeBatchId ||
      !activeBatchLifecycleStatus ||
      !isTerminalBatchStatus(activeBatchLifecycleStatus)
    ) {
      return;
    }

    captureAnalyticsEvent(ANALYTICS_EVENTS.WORKFLOW_RUN_COMPLETED, {
      outcome:
        activeBatchLifecycleStatus === WorkflowExecutionStatus.COMPLETED
          ? 'success'
          : 'failure',
      workflowType: 'batch',
    });
    startedBatchExecutionIdRef.current = null;
  }, [activeBatchId, activeBatchLifecycleStatus]);

  const pollActiveBatchStatus = useCallback(async () => {
    if (!activeBatchId) {
      return;
    }

    try {
      const service = await getService();
      const execution = await service.getExecution(activeBatchId);
      const nextBatchStatus = toBatchExecution(execution);
      if (!nextBatchStatus) {
        throw new Error('Execution is not a workflow batch');
      }

      // The operator may have switched batches while this request was in
      // flight; a late response must not overwrite the one they are watching.
      if (polledBatchIdRef.current !== activeBatchId) {
        return;
      }

      setActiveBatchStatus(nextBatchStatus);
      setRecentExecutions((previousExecutions) =>
        upsertRecentExecution(previousExecutions, nextBatchStatus),
      );
    } catch (pollError) {
      logger.error('Failed to poll batch status', {
        error: pollError,
        executionId: activeBatchId,
      });
    }
  }, [activeBatchId, getService]);

  useVisiblePolling(pollActiveBatchStatus, {
    intervalMs: BATCH_POLL_INTERVAL_MS,
    isEnabled:
      Boolean(activeBatchId) &&
      activeBatchLifecycleStatus !== undefined &&
      !isTerminalBatchStatus(activeBatchLifecycleStatus),
  });

  useEffect(() => {
    const selectableIds = new Set(availableOutputs.map(({ item }) => item.id));

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

        for (
          let offset = 0;
          offset < pendingFiles.length;
          offset += BATCH_UPLOAD_CONCURRENCY
        ) {
          const batch = pendingFiles.slice(
            offset,
            offset + BATCH_UPLOAD_CONCURRENCY,
          );

          await Promise.all(
            batch.map(async (pendingFile) => {
              try {
                const formData = new FormData();
                formData.append('file', pendingFile.file);
                formData.append('category', 'images');

                const ingredient =
                  await ingredientsService.postUpload(formData);
                const ingredientId = ingredient.id;

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
            }),
          );
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

    let runStarted = false;

    try {
      setError(null);
      setIsStartingBatch(true);

      const service = await getService();
      captureAnalyticsEvent(ANALYTICS_EVENTS.WORKFLOW_RUN_STARTED, {
        workflowType: 'batch',
      });
      runStarted = true;
      startedBatchExecutionIdRef.current = null;
      const execution = await service.startBatchExecution(
        selectedWorkflowId,
        ingredientIds,
      );
      const batchExecution = toBatchExecution(execution);
      if (!batchExecution) {
        throw new Error('Workflow batch execution metadata is missing');
      }
      startedBatchExecutionIdRef.current = execution.id;
      replaceExecutionQuery(execution.id);
      setSelectedOutputIds(new Set());
      setActiveBatchStatus(batchExecution);
      setRecentExecutions((previousExecutions) =>
        upsertRecentExecution(previousExecutions, batchExecution),
      );
    } catch (runError) {
      if (runStarted && !startedBatchExecutionIdRef.current) {
        captureAnalyticsEvent(ANALYTICS_EVENTS.WORKFLOW_RUN_COMPLETED, {
          outcome: 'failure',
          workflowType: 'batch',
        });
      }
      const message =
        runError instanceof Error ? runError.message : 'Failed to start batch.';
      setError(message);
      logger.error('Failed to start batch workflow run', { error: runError });
    } finally {
      setIsStartingBatch(false);
    }
  }, [
    canRunBatch,
    files,
    getService,
    replaceExecutionQuery,
    selectedWorkflowId,
  ]);

  const handleOpenRecentExecution = useCallback(
    async (executionId: string) => {
      setError(null);
      replaceExecutionQuery(executionId);
      await loadBatchExecution(executionId);
    },
    [loadBatchExecution, replaceExecutionQuery],
  );

  const handleBackToComposer = useCallback(() => {
    setActiveBatchStatus(null);
    setSelectedOutputIds(new Set());
    setError(null);
    replaceExecutionQuery(null);
  }, [replaceExecutionQuery]);

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
    handleOpenRecentExecution,
    handlePublish,
    handleRunBatch,
    hasPendingUploads,
    isDragActive,
    isBootstrapping,
    isLoadingExecution,
    isRunningBulkAction,
    isStartingBatch,
    openPostBatchModal,
    push,
    recentExecutions,
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
