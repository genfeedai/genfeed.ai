'use client';

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
import { Play } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@genfeedai/workflows/ui/styles';
import '@/features/workflows/styles/workflow-scope.css';

import { CloudNodePalette } from '@/features/workflows/components/CloudNodePalette';
import { ExecutionPanel } from '@/features/workflows/components/ExecutionPanel';
import { CloudCreditsIndicator } from '@/features/workflows/components/editor/CloudCreditsIndicator';
import { CloudWorkflowToolbar } from '@/features/workflows/components/editor/CloudWorkflowToolbar';
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

type WorkflowStoreState = ReturnType<typeof useWorkflowStore.getState>;
type WorkflowSeed = Pick<WorkflowStoreState, 'edges' | 'nodes'> & {
  workflowName: string;
};

function buildMessagesAutomationSeed(
  searchParams: URLSearchParams,
): WorkflowSeed | null {
  if (searchParams.get('source') !== 'messages') {
    return null;
  }

  const conversationId = searchParams.get('conversationId');
  if (!conversationId) {
    return null;
  }

  const credentialId = searchParams.get('credentialId') ?? '';
  const platform = searchParams.get('platform') ?? 'youtube';
  const sourceContentId = searchParams.get('sourceContentId') ?? '';

  const nodes = [
    {
      data: {
        config: {
          conversationId,
          credentialId,
          platform,
          sourceContentId,
        },
        conversationId,
        credentialId,
        label: 'Comment Trigger',
        platform,
        sourceContentId,
        status: 'idle',
        type: 'commentTrigger',
      },
      id: 'messages-comment-trigger',
      position: { x: 120, y: 160 },
      type: 'commentTrigger',
    },
  ] as unknown as WorkflowStoreState['nodes'];

  return {
    edges: [] as unknown as WorkflowStoreState['edges'],
    nodes,
    workflowName: 'Social Comment Automation',
  };
}

/**
 * New workflow page - same inlined composition as the detail page,
 * but without a workflowId (creates a new workflow on first save).
 */
export default function WorkflowNewPageClient() {
  const searchParams = useSearchParams();
  const hasSeededMessagesAutomationRef = useRef(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showExecutionPanel, setShowExecutionPanel] = useState(false);
  const [showRunPanel, setShowRunPanel] = useState(false);
  const [activeExecutionId, setActiveExecutionId] = useState<
    string | undefined
  >();
  const [workflowRunTracker] = useState(createEditorWorkflowRunTracker);
  const getWorkflowService = useAuthedService(createWorkflowApiService);

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
  } = useCloudWorkflow({ autoSave: true });
  const currentWorkflowId = useWorkflowStore((state) => state.workflowId);
  const hasRunInputs = inputVariables.length > 0;

  const messagesAutomationSeed = useMemo(
    () =>
      buildMessagesAutomationSeed(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  useEffect(() => {
    if (
      isLoading ||
      hasSeededMessagesAutomationRef.current ||
      !messagesAutomationSeed
    ) {
      return;
    }

    const currentState = useWorkflowStore.getState();
    if (currentState.nodes.length > 0) {
      hasSeededMessagesAutomationRef.current = true;
      return;
    }

    useWorkflowStore.setState({
      edges: messagesAutomationSeed.edges,
      isDirty: true,
      nodes: messagesAutomationSeed.nodes,
      workflowName: messagesAutomationSeed.workflowName,
    });
    hasSeededMessagesAutomationRef.current = true;
  }, [isLoading, messagesAutomationSeed]);

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

        const runnableWorkflowId = useWorkflowStore.getState().workflowId;
        if (!runnableWorkflowId) {
          throw new Error('Workflow must be saved before it can run');
        }

        if (options.saveDefaults) {
          await saveInputDefaults(inputValues);
        }

        workflowRunTracker.trackStarted();
        runStarted = true;

        const execution = await service.execute(runnableWorkflowId, {
          inputValues,
          metadata: { source: 'workflow-editor-run-panel' },
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
          workflowId: currentWorkflowId ?? 'new',
        });
      } finally {
        setIsRunning(false);
      }
    },
    [
      currentWorkflowId,
      getWorkflowService,
      saveInputDefaults,
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

  const toolbarElement = (
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
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              onClick={handleRunButtonClick}
              disabled={isRunning || isLoading}
              icon={<Play className="size-4" />}
            >
              {isRunning ? 'Running…' : 'Run'}
            </Button>
            {lifecycle === WorkflowLifecycle.DRAFT && (
              <Button
                variant={ButtonVariant.DEFAULT}
                size={ButtonSize.SM}
                onClick={handlePublish}
                disabled={isLoading}
              >
                Publish
              </Button>
            )}
            {lifecycle !== WorkflowLifecycle.ARCHIVED && (
              <Button
                variant={ButtonVariant.DESTRUCTIVE}
                size={ButtonSize.SM}
                onClick={handleArchive}
                disabled={isLoading}
                className="border-border bg-transparent text-muted-foreground hover:border-foreground/20 hover:bg-accent hover:text-foreground"
              >
                Archive
              </Button>
            )}
          </div>
        </div>
      }
    />
  );

  return (
    <WorkflowUIProvider config={workflowUiConfig}>
      <ReactFlowProvider>
        <div className="workflow-scope workflow-editor-shell flex h-[calc(100dvh-var(--desktop-titlebar-height)-3rem)] min-h-0 flex-col bg-background text-foreground">
          {cloudError && (
            <div className="border-b border-destructive/20 bg-destructive/10 px-4 py-2 text-xs text-destructive">
              {cloudError}
            </div>
          )}

          {isLoading ? (
            <main
              className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
              data-testid="workflow-editor-loading-shell"
            >
              {toolbarElement}
              <div className="flex flex-1 items-center justify-center">
                <div className="animate-pulse text-muted-foreground">
                  Loading editor…
                </div>
              </div>
            </main>
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
                ) : showExecutionPanel ? (
                  <ExecutionPanel
                    workflowId={currentWorkflowId ?? 'new'}
                    onClose={() => setShowExecutionPanel(false)}
                    onTerminalExecution={handleTerminalExecution}
                    runId={activeExecutionId}
                  />
                ) : null
              }
              toolbar={toolbarElement}
            />
          )}
        </div>
      </ReactFlowProvider>
    </WorkflowUIProvider>
  );
}
