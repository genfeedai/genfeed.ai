'use client';

import { useAgentChatStore } from '@genfeedai/agent';
import type { WorkflowExecutionStatus } from '@genfeedai/enums';
import {
  buildWorkflowEtaSnapshot,
  formatEtaDuration,
  formatEtaRange,
  shouldDisplayEta,
} from '@helpers/generation-eta.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  ActionNodeInspector,
  WorkflowEditorShell,
} from '@genfeedai/workflows/ui';
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

import { useTranslations } from 'next-intl';
import { CloudNodePalette } from '@/features/workflows/components/CloudNodePalette';
import { ExecutionPanel } from '@/features/workflows/components/ExecutionPanel';
import { CloudCreditsIndicator } from '@/features/workflows/components/editor/CloudCreditsIndicator';
import { CloudWorkflowToolbar } from '@/features/workflows/components/editor/CloudWorkflowToolbar';
import { WorkflowEditorSectionTopbar } from '@/features/workflows/components/editor/WorkflowEditorSectionTopbar';
import { WorkflowScheduleDialog } from '@/features/workflows/components/schedule/WorkflowScheduleDialog';
import { WorkflowRunPanel } from '@/features/workflows/components/WorkflowRunPanel';
import { useCloudWorkflow } from '@/features/workflows/hooks/useCloudWorkflow';
import { cloudNodeTypes } from '@/features/workflows/nodes/merged-node-types';
import { createWorkflowApiService } from '@/features/workflows/services/workflow-api';
import { useCloudWorkflowStore } from '@/features/workflows/stores/cloud-workflow-store';
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
  const workflowName = useWorkflowStore((state) => state.workflowName);
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

  return (
    <WorkflowUIProvider config={workflowUiConfig}>
      <ReactFlowProvider>
        <div className="workflow-scope workflow-editor-shell flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
          <WorkflowEditorSectionTopbar
            estimateLabel={workflowEstimateLabel}
            isRunning={isRunning}
            lifecycle={lifecycle}
            onArchive={handleArchive}
            onPublish={handlePublish}
            onRun={handleRunButtonClick}
            onSchedule={() => setIsScheduleDialogOpen(true)}
            title={workflowName || 'Workflow editor'}
          />

          {cloudError && (
            <div className="shrink-0 border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
              {cloudError}
            </div>
          )}

          {isLoading ? (
            <main
              aria-label={translate('detail.loadingEditor')}
              className="min-h-0 flex-1 bg-background"
              data-testid="workflow-editor-loading-shell"
            />
          ) : (
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
                ) : (
                  <ActionNodeInspector />
                )
              }
              toolbar={
                <CloudWorkflowToolbar
                  isSaving={isSaving}
                  middleContent={<CloudCreditsIndicator />}
                  onRename={handleRename}
                />
              }
            />
          )}

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
