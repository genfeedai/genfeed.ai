'use client';

import { useAgentChatStore } from '@genfeedai/agent';
import {
  ButtonSize,
  ButtonVariant,
  type WorkflowExecutionStatus,
  WorkflowLifecycle,
} from '@genfeedai/enums';
import {
  buildWorkflowEtaSnapshot,
  formatEtaDuration,
  formatEtaRange,
  shouldDisplayEta,
} from '@helpers/generation-eta.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { Button } from '@ui/primitives/button';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { WorkflowEditorShell } from '@genfeedai/workflows/ui';
import {
  type WorkflowUIConfig,
  WorkflowUIProvider,
} from '@genfeedai/workflows/ui/provider';
import {
  selectEdges,
  selectNodes,
  useWorkflowStore,
} from '@genfeedai/workflows/ui/stores';
import { useCallback, useMemo, useState } from 'react';
import '@genfeedai/workflows/ui/styles';
import '@/features/workflows/styles/workflow-scope.css';

import { CalendarClock, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CloudNodePalette } from '@/features/workflows/components/CloudNodePalette';
import { ExecutionPanel } from '@/features/workflows/components/ExecutionPanel';
import { CloudCreditsIndicator } from '@/features/workflows/components/editor/CloudCreditsIndicator';
import { CloudWorkflowToolbar } from '@/features/workflows/components/editor/CloudWorkflowToolbar';
import { WorkflowScheduleDialog } from '@/features/workflows/components/schedule/WorkflowScheduleDialog';
import { WorkflowRunPanel } from '@/features/workflows/components/WorkflowRunPanel';
import { useCloudWorkflow } from '@/features/workflows/hooks/useCloudWorkflow';
import { cloudNodeTypes } from '@/features/workflows/nodes/merged-node-types';
import { createWorkflowApiService } from '@/features/workflows/services/workflow-api';
import { useCloudWorkflowStore } from '@/features/workflows/stores/cloud-workflow-store';
import { getLifecycleBadgeClass } from '@/features/workflows/utils/status-helpers';
import {
  coerceWorkflowItems,
  getWorkflowNodeConfig,
  getWorkflowNodeLabel,
  type WorkflowGraphEdgeLike,
  type WorkflowGraphNodeLike,
} from '@/features/workflows/utils/workflow-graph';
import { createEditorWorkflowRunTracker } from '@/lib/analytics';
import { promptsApi, workflowsApi } from '@/lib/api';
import { getExecutionProviderHeaders } from '@/lib/api/execution-headers';
import { postWorkflowExecution } from '@/lib/api/execution-http-client';
import { createSettingsSyncService } from '@/lib/api/settings-sync';
import { applyEditOperations } from '@/lib/chat/editOperations';
import WorkflowEditorToolbarNavigation from '../components/WorkflowEditorToolbarNavigation';

interface WorkflowDetailPageClientProps {
  workflowId: string;
  initialExecutionId?: string;
}

/**
 * Workflow detail page - inlines the editor composition directly.
 * Wraps ReactFlowProvider + WorkflowUIProvider and composes:
 * - WorkflowEditorShell (shared canvas from workflow-ui)
 * - Cloud-specific toolbar, nodes, execution panel
 * - useCloudWorkflow for API integration (load, auto-save, lifecycle)
 */
export default function WorkflowDetailPageClient({
  workflowId,
  initialExecutionId,
}: WorkflowDetailPageClientProps) {
  const translate = useTranslations('common.automation.workflows');
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(
    null,
  );
  const [isRunning, setIsRunning] = useState(false);
  const [showExecutionPanel, setShowExecutionPanel] = useState(false);
  const [showRunPanel, setShowRunPanel] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [closedInitialExecutionId, setClosedInitialExecutionId] = useState<
    string | null
  >(null);
  const [workflowRunTracker] = useState(createEditorWorkflowRunTracker);
  const getWorkflowService = useAuthedService(createWorkflowApiService);
  const activeThreadId = useAgentChatStore((state) => state.activeThreadId);
  const activeThread = useAgentChatStore((state) =>
    state.threads.find((thread) => thread.id === state.activeThreadId),
  );

  const {
    isLoading,
    isSaving,
    error: cloudError,
    inputVariables,
    lifecycle,
    save,
    saveInputDefaults,
    publish,
    archive,
  } = useCloudWorkflow({ autoSave: true, workflowId });
  const currentWorkflowId = useWorkflowStore((state) => state.workflowId);
  const hasRunInputs = inputVariables.length > 0;

  const initialExecutionPanelOpen =
    !isLoading &&
    Boolean(initialExecutionId) &&
    closedInitialExecutionId !== initialExecutionId;
  const visibleExecutionPanelId = showExecutionPanel
    ? activeExecutionId
    : initialExecutionPanelOpen
      ? initialExecutionId
      : null;

  const handleCloseExecutionPanel = useCallback(() => {
    if (initialExecutionId) {
      setClosedInitialExecutionId(initialExecutionId);
    }
    setShowExecutionPanel(false);
  }, [initialExecutionId]);

  const nodes = useWorkflowStore(selectNodes);
  const edges = useWorkflowStore(selectEdges);
  const safeNodes = coerceWorkflowItems<WorkflowGraphNodeLike>(nodes);
  const safeEdges = coerceWorkflowItems<WorkflowGraphEdgeLike>(edges);

  const workflowEstimate = useMemo(() => {
    return buildWorkflowEtaSnapshot({
      currentPhase: 'Queued',
      edges: safeEdges.map((edge: (typeof safeEdges)[number]) => ({
        source: edge.source,
        target: edge.target,
      })),
      nodes: safeNodes.map((node: (typeof safeNodes)[number]) => ({
        config: getWorkflowNodeConfig(node),
        id: node.id,
        label: getWorkflowNodeLabel(node),
        type: node.type ?? 'unknown',
      })),
    });
  }, [safeEdges, safeNodes]);

  const workflowEstimateLabel = useMemo(() => {
    if (!shouldDisplayEta(workflowEstimate)) {
      return null;
    }
    const estimatedDurationMs = workflowEstimate.estimatedDurationMs;
    if (!estimatedDurationMs) {
      return null;
    }
    return workflowEstimate.etaConfidence === 'low'
      ? `Usually ${formatEtaRange(estimatedDurationMs)}`
      : `Typical run ~${formatEtaDuration(estimatedDurationMs)}`;
  }, [workflowEstimate]);

  const workflowUiConfig = useMemo<WorkflowUIConfig>(
    () => ({
      applyEditOperations,
      executionApiBaseUrl: EnvironmentService.apiEndpoint,
      executionHeaders: getExecutionProviderHeaders,
      executionHttpClient: {
        post: postWorkflowExecution,
      },
      logger,
      promptLibrary: promptsApi,
      settingsSync: createSettingsSyncService(),
      workflowPersistence: {
        create: workflowsApi.create,
        delete: workflowsApi.delete,
        duplicate: workflowsApi.duplicate,
        getAll: workflowsApi.getAll,
        getById: workflowsApi.getById,
        update: workflowsApi.update,
      },
      workflowReferences: {
        fetchReferencableWorkflows: (excludeId, signal) =>
          workflowsApi.getReferencable(excludeId ?? undefined, signal),
        fetchWorkflowInterface: workflowsApi.getInterface,
        validateReference: async (parentWorkflowId, childWorkflowId) => {
          await workflowsApi.validateReference(
            parentWorkflowId,
            childWorkflowId,
          );
        },
      },
      workflowsApi: {
        setThumbnail: async (selectedWorkflowId, thumbnailUrl, nodeId) => {
          const service = await getWorkflowService();
          await service.setThumbnail(selectedWorkflowId, thumbnailUrl, nodeId);
        },
      },
    }),
    [getWorkflowService],
  );

  const handlePublish = useCallback(async () => {
    await publish();
  }, [publish]);

  const handleArchive = useCallback(async () => {
    await archive();
  }, [archive]);

  const handleRename = useCallback(async () => {
    await save();
  }, [save]);

  const handleTerminalExecution = useCallback(
    (execution: { id: string; status: WorkflowExecutionStatus }) => {
      workflowRunTracker.trackTerminalExecution(execution);
    },
    [workflowRunTracker],
  );

  const handleRun = useCallback(
    async (
      inputValues: Record<string, unknown> = {},
      options: { saveDefaults: boolean } = { saveDefaults: false },
    ) => {
      let runStarted = false;

      try {
        setIsRunning(true);
        const service = await getWorkflowService();
        await useCloudWorkflowStore.getState().saveToCloud(service);

        const runnableWorkflowId =
          useWorkflowStore.getState().workflowId ?? workflowId;
        if (!runnableWorkflowId) {
          throw new Error('Workflow must be saved before it can run');
        }

        if (options.saveDefaults) {
          await saveInputDefaults(inputValues);
        }

        workflowRunTracker.trackStarted();
        runStarted = true;

        const execution = await service.execute(runnableWorkflowId, {
          expectedContextVersion: activeThread?.contextVersion,
          inputValues,
          metadata: { source: 'workflow-editor-run-panel' },
          threadId: activeThreadId ?? undefined,
        });
        workflowRunTracker.trackLaunchAccepted(execution.id);
        setActiveExecutionId(execution.id);
        setShowRunPanel(false);
        setShowExecutionPanel(true);
      } catch (error) {
        if (runStarted) {
          workflowRunTracker.trackLaunchFailed();
        }
        logger.error('Failed to run workflow', {
          error,
          workflowId: workflowId ?? currentWorkflowId ?? 'new',
        });
      } finally {
        setIsRunning(false);
      }
    },
    [
      activeThread?.contextVersion,
      activeThreadId,
      currentWorkflowId,
      getWorkflowService,
      saveInputDefaults,
      workflowId,
      workflowRunTracker,
    ],
  );

  const handleRunButtonClick = useCallback(() => {
    if (hasRunInputs) {
      setShowExecutionPanel(false);
      setShowRunPanel(true);
      return;
    }

    void handleRun();
  }, [handleRun, hasRunInputs]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          {translate('detail.loadingEditor')}
        </div>
      </div>
    );
  }

  return (
    <WorkflowUIProvider config={workflowUiConfig}>
      <ReactFlowProvider>
        <div className="workflow-scope workflow-editor-shell flex h-[calc(100dvh-var(--desktop-titlebar-height)-3rem)] min-h-0 flex-col bg-background text-foreground">
          {cloudError && (
            <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
              {cloudError}
            </div>
          )}

          <WorkflowEditorShell
            nodePalette={<CloudNodePalette />}
            nodeTypes={cloudNodeTypes}
            rightPanel={
              showRunPanel ? (
                <WorkflowRunPanel
                  inputVariables={inputVariables}
                  isRunning={isRunning}
                  onClose={() => setShowRunPanel(false)}
                  onRun={handleRun}
                />
              ) : visibleExecutionPanelId ? (
                <ExecutionPanel
                  workflowId={currentWorkflowId ?? workflowId ?? 'new'}
                  onClose={handleCloseExecutionPanel}
                  onTerminalExecution={handleTerminalExecution}
                  runId={visibleExecutionPanelId}
                />
              ) : null
            }
            toolbar={
              <CloudWorkflowToolbar
                isSaving={isSaving}
                leftContent={<WorkflowEditorToolbarNavigation />}
                middleContent={<CloudCreditsIndicator />}
                onRename={handleRename}
                rightContent={
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {workflowEstimateLabel && (
                        <span className="rounded-full border border-border/80 bg-secondary/35 px-2.5 py-1 text-2xs text-muted-foreground">
                          {workflowEstimateLabel}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${getLifecycleBadgeClass(lifecycle)}`}
                      >
                        {lifecycle}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant={ButtonVariant.SECONDARY}
                        size={ButtonSize.SM}
                        onClick={() => setIsScheduleDialogOpen(true)}
                        icon={<CalendarClock className="size-4" />}
                        tooltip={translate('actions.scheduleTooltip')}
                      >
                        {translate('actions.schedule')}
                      </Button>
                      <Button
                        variant={ButtonVariant.DEFAULT}
                        size={ButtonSize.SM}
                        onClick={handleRunButtonClick}
                        disabled={isRunning}
                        icon={<Play className="size-4" />}
                      >
                        {isRunning
                          ? translate('actions.running')
                          : translate('actions.run')}
                      </Button>
                      {lifecycle === WorkflowLifecycle.DRAFT && (
                        <Button
                          variant={ButtonVariant.DEFAULT}
                          size={ButtonSize.SM}
                          onClick={handlePublish}
                        >
                          {translate('actions.publish')}
                        </Button>
                      )}
                      {lifecycle !== WorkflowLifecycle.ARCHIVED && (
                        <Button
                          variant={ButtonVariant.DESTRUCTIVE}
                          size={ButtonSize.SM}
                          onClick={handleArchive}
                          className="border-border bg-transparent text-muted-foreground hover:border-foreground/20 hover:bg-accent hover:text-foreground"
                        >
                          {translate('actions.archive')}
                        </Button>
                      )}
                    </div>
                  </div>
                }
              />
            }
          />

          {isScheduleDialogOpen ? (
            <WorkflowScheduleDialog
              isOpen
              onOpenChange={setIsScheduleDialogOpen}
              workflowId={currentWorkflowId ?? workflowId}
            />
          ) : null}
        </div>
      </ReactFlowProvider>
    </WorkflowUIProvider>
  );
}
