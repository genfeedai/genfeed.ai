'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { WorkflowFile } from '@genfeedai/types';
import { useUIStore } from '@genfeedai/workflow-ui/stores';
import Button from '@ui/buttons/base/Button';
import {
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
} from '@xyflow/react';
import { toPng } from 'html-to-image';
import {
  AlertCircle,
  BookMarked,
  Bug,
  Camera,
  Copy,
  DollarSign,
  FolderOpen,
  LayoutGrid,
  LayoutTemplate,
  MessageSquare,
  Redo2,
  Save,
  SaveAll,
  Settings,
  Sparkles,
  Store,
  Undo2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { TagEditor } from '@/components/workflow/TagEditor';
import { WorkflowSwitcher } from '@/components/workflow/WorkflowSwitcher';
import { usePaneActions } from '@/hooks/usePaneActions';
import { logger } from '@/lib/logger';
import { calculateWorkflowCost } from '@/lib/replicate/client';
import { useExecutionStore } from '@/store/executionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useWorkflowStore } from '@/store/workflowStore';
import { CommentNavigator } from './CommentNavigator';
import { SaveAsDialog } from './SaveAsDialog';
import { SaveIndicator } from './SaveIndicator';
import { ToolbarDropdown } from './ToolbarDropdown';
import type { DropdownItem } from './types';

/**
 * Validates workflow JSON structure before loading
 */
function isValidWorkflow(data: unknown): data is WorkflowFile {
  if (!data || typeof data !== 'object') return false;

  const workflow = data as Record<string, unknown>;

  if (typeof workflow.name !== 'string') return false;
  if (!Array.isArray(workflow.nodes)) return false;
  if (!Array.isArray(workflow.edges)) return false;

  for (const node of workflow.nodes) {
    if (!node || typeof node !== 'object') return false;
    const n = node as Record<string, unknown>;
    if (typeof n.id !== 'string') return false;
    if (typeof n.type !== 'string') return false;
    if (!n.position || typeof n.position !== 'object') return false;
  }

  for (const edge of workflow.edges) {
    if (!edge || typeof edge !== 'object') return false;
    const e = edge as Record<string, unknown>;
    if (typeof e.id !== 'string') return false;
    if (typeof e.source !== 'string') return false;
    if (typeof e.target !== 'string') return false;
  }

  return true;
}

export function Toolbar() {
  const router = useRouter();
  const {
    exportWorkflow,
    workflowId,
    workflowName,
    workflowTags,
    setWorkflowTags,
    duplicateWorkflowApi,
    nodes,
  } = useWorkflowStore();
  const { getNodes } = useReactFlow();
  const { undo, redo } = useWorkflowStore.temporal.getState();
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const validationErrors = useExecutionStore((state) => state.validationErrors);
  const clearValidationErrors = useExecutionStore(
    (state) => state.clearValidationErrors,
  );
  const estimatedCost = useExecutionStore((state) => state.estimatedCost);
  const actualCost = useExecutionStore((state) => state.actualCost);
  const setEstimatedCost = useExecutionStore((state) => state.setEstimatedCost);
  const { toggleAIGenerator, openModal } = useUIStore();
  const toggleChat = useWorkflowStore((s) => s.toggleChat);
  const debugMode = useSettingsStore((s) => s.debugMode);
  const { autoLayout } = usePaneActions();

  const uniqueErrorMessages = useMemo(() => {
    if (!validationErrors?.errors.length) return [];
    return [...new Set(validationErrors.errors.map((e) => e.message))];
  }, [validationErrors]);

  // Subscribe to temporal state changes for undo/redo button states
  useEffect(() => {
    const unsubscribe = useWorkflowStore.temporal.subscribe((state) => {
      setCanUndo(state.pastStates.length > 0);
      setCanRedo(state.futureStates.length > 0);
    });
    // Initialize state
    const temporal = useWorkflowStore.temporal.getState();
    setCanUndo(temporal.pastStates.length > 0);
    setCanRedo(temporal.futureStates.length > 0);
    return unsubscribe;
  }, []);

  // Memoize cost-relevant data to avoid recalculating on every position change
  const costRelevantData = useMemo(
    () =>
      nodes.map((node) => ({
        duration: node.data.duration,
        generateAudio: node.data.generateAudio,
        model: node.data.model,
        resolution: node.data.resolution,
        type: node.type,
      })),
    [nodes],
  );

  // Track previous cost data to avoid unnecessary recalculations
  const prevCostDataRef = useRef<string>('');

  // Update estimated cost when cost-relevant node data changes
  useEffect(() => {
    const costData = JSON.stringify(costRelevantData);

    // Only recalculate if cost-relevant data changed
    if (costData !== prevCostDataRef.current) {
      prevCostDataRef.current = costData;
      const cost = calculateWorkflowCost(nodes);
      setEstimatedCost(cost);
    }
  }, [costRelevantData, nodes, setEstimatedCost]);

  const handleSave = useCallback(() => {
    const workflow = exportWorkflow();
    const blob = new Blob([JSON.stringify(workflow, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${workflow.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [exportWorkflow]);

  const handleLoad = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);

          if (!isValidWorkflow(data)) {
            logger.error('Invalid workflow file structure', null, {
              context: 'Toolbar',
            });
            return;
          }

          useWorkflowStore.getState().loadWorkflow(data);
        } catch (error) {
          logger.error('Failed to parse workflow file', error, {
            context: 'Toolbar',
          });
        }
      };
      reader.onerror = () => {
        logger.error('Failed to read workflow file', reader.error, {
          context: 'Toolbar',
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  const handleOpenFolder = useCallback(async () => {
    if (!workflowId) return;
    try {
      await fetch('/api/open-folder', {
        body: JSON.stringify({ workflowId }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    } catch (error) {
      logger.error('Failed to open output folder', error, {
        context: 'Toolbar',
      });
    }
  }, [workflowId]);

  const handleDuplicate = useCallback(async () => {
    if (!workflowId) return;
    try {
      const duplicated = await duplicateWorkflowApi(workflowId);
      router.push(`/workflows/${duplicated._id}`);
    } catch (error) {
      logger.error('Failed to duplicate workflow', error, {
        context: 'Toolbar',
      });
    }
  }, [workflowId, duplicateWorkflowApi, router]);

  const handleSaveAs = useCallback(
    async (newName: string) => {
      if (!workflowId) return;
      try {
        const duplicated = await duplicateWorkflowApi(workflowId);
        // Navigate to the duplicated workflow - the name will be set on the new workflow
        router.push(
          `/workflows/${duplicated._id}?rename=${encodeURIComponent(newName)}`,
        );
        setShowSaveAsDialog(false);
      } catch (error) {
        logger.error('Failed to save workflow as copy', error, {
          context: 'Toolbar',
        });
      }
    },
    [workflowId, duplicateWorkflowApi, router],
  );

  const handleScreenshot = useCallback(async () => {
    const allNodes = getNodes();
    if (allNodes.length === 0) return;

    const imageWidth = 1920;
    const imageHeight = 1080;
    const bounds = getNodesBounds(allNodes);
    const viewport = getViewportForBounds(
      bounds,
      imageWidth,
      imageHeight,
      0.5,
      2,
      0.15,
    );

    const viewportEl = document.querySelector<HTMLElement>(
      '.react-flow__viewport',
    );
    if (!viewportEl) return;

    try {
      const dataUrl = await toPng(viewportEl, {
        backgroundColor: '#171717',
        height: imageHeight,
        imagePlaceholder:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        style: {
          height: String(imageHeight),
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          width: String(imageWidth),
        },
        width: imageWidth,
      });

      const safeName = (workflowName || 'workflow')
        .toLowerCase()
        .replace(/\s+/g, '-');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${safeName}-screenshot.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      logger.error('Failed to capture workflow screenshot', error, {
        context: 'Toolbar',
      });
    }
  }, [getNodes, workflowName]);

  const fileMenuItems: DropdownItem[] = useMemo(
    () => [
      {
        disabled: !workflowId,
        icon: <Copy className="h-4 w-4" />,
        id: 'duplicate',
        label: 'Duplicate Workflow',
        onClick: handleDuplicate,
      },
      {
        disabled: !workflowId,
        icon: <SaveAll className="h-4 w-4" />,
        id: 'saveAs',
        label: 'Save As...',
        onClick: () => setShowSaveAsDialog(true),
      },
      {
        id: 'separator-1',
        separator: true,
      },
      {
        icon: <Save className="h-4 w-4" />,
        id: 'export',
        label: 'Export Workflow',
        onClick: handleSave,
      },
      {
        icon: <FolderOpen className="h-4 w-4" />,
        id: 'import',
        label: 'Import Workflow',
        onClick: handleLoad,
      },
    ],
    [handleSave, handleLoad, handleDuplicate, workflowId],
  );

  const resourcesMenuItems: DropdownItem[] = useMemo(
    () => [
      {
        icon: <LayoutTemplate className="h-4 w-4" />,
        id: 'templates',
        label: 'Templates',
        onClick: () => openModal('templates'),
      },
      {
        icon: <BookMarked className="h-4 w-4" />,
        id: 'promptLibrary',
        label: 'Prompt Library',
        onClick: () => openModal('promptLibrary'),
      },
      {
        icon: <Sparkles className="h-4 w-4" />,
        id: 'aiGenerator',
        label: 'AI Generator',
        onClick: toggleAIGenerator,
      },
      {
        icon: <MessageSquare className="h-4 w-4" />,
        id: 'workflowAssistant',
        label: 'Workflow Assistant (BYOK)',
        onClick: toggleChat,
      },
      {
        id: 'separator-1',
        separator: true,
      },
      {
        external: true,
        icon: <Store className="h-4 w-4" />,
        id: 'marketplace',
        label: 'Marketplace',
        onClick: () => window.open('https://marketplace.genfeed.ai', '_blank'),
      },
    ],
    [openModal, toggleAIGenerator, toggleChat],
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-14 items-center gap-3 border-b border-border bg-card px-4">
        {/* Logo / Home Link */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              href="/"
              className="flex h-6 w-6 items-center justify-center hover:opacity-90 transition"
            >
              <img
                src="https://cdn.genfeed.ai/assets/branding/logo-white.png"
                alt="Genfeed"
                className="h-6 w-6 object-contain"
              />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Go to Dashboard</p>
          </TooltipContent>
        </Tooltip>

        {/* Workflow Switcher */}
        <WorkflowSwitcher />

        {/* Tags */}
        <TagEditor tags={workflowTags} onChange={setWorkflowTags} />

        {/* Divider */}
        <div className="h-8 w-px bg-border" />

        {/* File Menu */}
        <ToolbarDropdown label="File" items={fileMenuItems} />

        {/* Resources Menu */}
        <ToolbarDropdown label="Resources" items={resourcesMenuItems} />

        {/* Divider */}
        <div className="h-8 w-px bg-border" />

        {/* Debug Mode Badge */}
        {debugMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={ButtonVariant.GHOST}
                withWrapper={false}
                onClick={() => openModal('settings')}
                className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-sm text-amber-500 transition hover:bg-amber-500/20"
              >
                <Bug className="h-4 w-4" />
                <span className="font-medium">Debug</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>Debug mode active - API calls are mocked</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Auto-layout Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() => autoLayout('LR')}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Auto-layout nodes</p>
          </TooltipContent>
        </Tooltip>

        {/* Undo/Redo Buttons */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() => undo()}
              isDisabled={!canUndo}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Undo (⌘Z)</p>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() => redo()}
              isDisabled={!canRedo}
            >
              <Redo2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Redo (⌘⇧Z)</p>
          </TooltipContent>
        </Tooltip>

        {/* Auto-Save Indicator */}
        <SaveIndicator />

        {/* Cost Indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={ButtonVariant.GHOST}
              withWrapper={false}
              onClick={() => openModal('cost')}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <DollarSign className="h-4 w-4" />
              <span className="font-medium tabular-nums">
                {actualCost > 0
                  ? actualCost.toFixed(2)
                  : estimatedCost.toFixed(2)}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>
              Estimated cost
              {actualCost > 0 ? ` (actual: $${actualCost.toFixed(2)})` : ''}
            </p>
          </TooltipContent>
        </Tooltip>

        {/* Comment Navigator */}
        <CommentNavigator />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Workflow Assistant */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={toggleChat}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Workflow Assistant (BYOK)</p>
          </TooltipContent>
        </Tooltip>

        {/* Screenshot Workflow */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={handleScreenshot}
            >
              <Camera className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Screenshot workflow</p>
          </TooltipContent>
        </Tooltip>

        {/* Open Output Folder */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={handleOpenFolder}
              isDisabled={!workflowId}
            >
              <FolderOpen className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Open output folder</p>
          </TooltipContent>
        </Tooltip>

        {/* Settings */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              onClick={() => openModal('settings')}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Settings</p>
          </TooltipContent>
        </Tooltip>

        {/* Validation Errors Toast */}
        {uniqueErrorMessages.length > 0 && (
          <div className="fixed right-4 top-20 z-50 max-w-sm rounded-lg border border-destructive/30 bg-destructive/10 p-4 shadow-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <h4 className="mb-2 text-sm font-medium text-destructive">
                  Cannot run workflow
                </h4>
                <ul className="space-y-1">
                  {uniqueErrorMessages.slice(0, 5).map((message) => (
                    <li key={message} className="text-xs text-destructive/80">
                      {message}
                    </li>
                  ))}
                  {uniqueErrorMessages.length > 5 && (
                    <li className="text-xs text-destructive/60">
                      +{uniqueErrorMessages.length - 5} more errors
                    </li>
                  )}
                </ul>
              </div>
              <Button
                variant={ButtonVariant.GHOST}
                size={ButtonSize.ICON}
                onClick={clearValidationErrors}
              >
                <X className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        )}

        {/* Save As Dialog */}
        <SaveAsDialog
          isOpen={showSaveAsDialog}
          currentName={workflowName}
          onSave={handleSaveAs}
          onClose={() => setShowSaveAsDialog(false)}
        />
      </div>
    </TooltipProvider>
  );
}
