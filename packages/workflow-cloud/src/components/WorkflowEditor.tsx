'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  buildWorkflowEtaSnapshot,
  formatEtaDuration,
  formatEtaRange,
  shouldDisplayEta,
} from '@helpers/generation-eta.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import Button from '@ui/buttons/base/Button';
import { ReactFlowProvider } from '@xyflow/react';
import type { ReactNode } from 'react';
import '@xyflow/react/dist/style.css';

import { WorkflowEditorShell } from '@genfeedai/workflow-ui';
import {
  type WorkflowUIConfig,
  WorkflowUIProvider,
} from '@genfeedai/workflow-ui/provider';
import {
  selectEdges,
  selectNodes,
  useWorkflowStore,
} from '@genfeedai/workflow-ui/stores';
import { useCallback, useEffect, useMemo, useState } from 'react';
import '@genfeedai/workflow-ui/styles';
import '@workflow-cloud/styles/workflow-scope.scss';

import { ExecutionPanel } from '@workflow-cloud/components/ExecutionPanel';
import { CloudCreditsIndicator } from '@workflow-cloud/components/editor/CloudCreditsIndicator';
import { CloudWorkflowToolbar } from '@workflow-cloud/components/editor/CloudWorkflowToolbar';
import { useCloudWorkflow } from '@workflow-cloud/hooks/useCloudWorkflow';
import { cloudNodeTypes } from '@workflow-cloud/nodes/merged-node-types';
import { createWorkflowApiService } from '@workflow-cloud/services/workflow-api';
import { useCloudWorkflowStore } from '@workflow-cloud/stores/cloud-workflow-store';
import { getLifecycleBadgeClass } from '@workflow-cloud/utils/status-helpers';
import {
  coerceWorkflowItems,
  getWorkflowNodeConfig,
  getWorkflowNodeLabel,
  type WorkflowGraphEdgeLike,
  type WorkflowGraphNodeLike,
} from '@workflow-cloud/utils/workflow-graph';

interface WorkflowEditorProps {
  workflowId?: string;
  templateId?: string;
  initialExecutionId?: string;
  logoHref?: string;
  toolbarLeftContent?: ReactNode;
}

/**
 * Cloud WorkflowEditor - Full-page visual workflow editor
 *
 * Uses the shared @genfeedai/workflow-ui canvas, toolbar, and node palette,
 * extended with cloud-specific SaaS nodes (brand, persona, publish).
 *
 * Cloud API integration is handled by the useCloudWorkflow hook which:
 * - Loads workflow data from the cloud API on mount
 * - Auto-saves when the shared store becomes dirty
 * - Provides lifecycle actions (publish, archive)
 * - Loads brands for the BrandNode
 */
export function WorkflowEditor({
  workflowId,
  templateId,
  initialExecutionId,
  logoHref = '/',
  toolbarLeftContent,
}: WorkflowEditorProps) {
  const [activeExecutionId, setActiveExecutionId] =
    useState(initialExecutionId);
  const [isRunning, setIsRunning] = useState(false);
  const [showExecutionPanel, setShowExecutionPanel] = useState(false);
  const getWorkflowService = useAuthedService(createWorkflowApiService);

  // Cloud API integration - handles load, save, lifecycle, brands
  const {
    isLoading,
    isSaving,
    error: cloudError,
    lifecycle,
    save,
    publish,
    archive,
  } = useCloudWorkflow({ autoSave: true, templateId, workflowId });
  const currentWorkflowId = useWorkflowStore((state) => state.workflowId);

  useEffect(() => {
    if (isLoading || !initialExecutionId) {
      return;
    }

    setActiveExecutionId(initialExecutionId);
    setShowExecutionPanel(true);
  }, [initialExecutionId, isLoading]);

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

  const handleRun = useCallback(async () => {
    try {
      setIsRunning(true);
      const service = await getWorkflowService();

      await useCloudWorkflowStore.getState().saveToCloud(service);

      const runnableWorkflowId =
        useWorkflowStore.getState().workflowId ?? workflowId;

      if (!runnableWorkflowId) {
        throw new Error('Workflow must be saved before it can run');
      }

      const execution = await service.execute(runnableWorkflowId);
      setActiveExecutionId(execution._id);
      setShowExecutionPanel(true);
    } catch (error) {
      logger.error('Failed to run workflow', {
        error,
        workflowId: workflowId ?? currentWorkflowId ?? 'new',
      });
    } finally {
      setIsRunning(false);
    }
  }, [currentWorkflowId, getWorkflowService, workflowId]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-[var(--muted-foreground)]">
          Loading editor...
        </div>
      </div>
    );
  }

  return (
    <WorkflowUIProvider config={workflowUiConfig}>
      <ReactFlowProvider>
        <div className="workflow-scope workflow-editor-shell flex h-screen flex-col bg-[var(--background)] text-[var(--foreground)]">
          {/* Cloud Error Banner */}
          {cloudError && (
            <div className="border-b border-[var(--destructive)]/20 bg-[var(--destructive)]/10 px-4 py-2 text-xs text-[var(--destructive)]">
              {cloudError}
            </div>
          )}

          <WorkflowEditorShell
            nodeTypes={cloudNodeTypes}
            rightPanel={
              showExecutionPanel ? (
                <ExecutionPanel
                  workflowId={currentWorkflowId ?? workflowId ?? 'new'}
                  onClose={() => setShowExecutionPanel(false)}
                  runId={activeExecutionId}
                />
              ) : null
            }
            toolbar={
              <CloudWorkflowToolbar
                isSaving={isSaving}
                leftContent={toolbarLeftContent}
                logoHref={logoHref}
                logoSrc="https://cdn.genfeed.ai/assets/branding/logo-white.png"
                middleContent={<CloudCreditsIndicator />}
                onRename={handleRename}
                rightContent={
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {workflowEstimateLabel && (
                        <span className="rounded-full border border-border/80 bg-secondary/35 px-2.5 py-1 text-[11px] text-[var(--muted-foreground)]">
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
                        onClick={handleRun}
                        isLoading={isRunning}
                      >
                        Run
                      </Button>

                      {lifecycle === 'draft' && (
                        <Button
                          variant={ButtonVariant.DEFAULT}
                          size={ButtonSize.SM}
                          onClick={handlePublish}
                        >
                          Publish
                        </Button>
                      )}

                      {lifecycle !== 'archived' && (
                        <Button
                          variant={ButtonVariant.DESTRUCTIVE}
                          size={ButtonSize.SM}
                          onClick={handleArchive}
                          className="border-border bg-transparent text-muted-foreground hover:border-foreground/20 hover:bg-accent hover:text-foreground"
                        >
                          Archive
                        </Button>
                      )}
                    </div>
                  </div>
                }
              />
            }
          />
        </div>
      </ReactFlowProvider>
    </WorkflowUIProvider>
  );
}
