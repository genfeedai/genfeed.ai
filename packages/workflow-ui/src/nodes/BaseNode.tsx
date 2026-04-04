'use client';

import type {
  HandleDefinition,
  NodeStatus,
  NodeType,
  SelectedModel,
  WorkflowNodeData,
} from '@genfeedai/types';
import { NODE_DEFINITIONS, NodeStatusEnum } from '@genfeedai/types';
import {
  Handle,
  type NodeProps,
  NodeResizer,
  Position,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { clsx } from 'clsx';
import {
  AlertCircle,
  ArrowLeftFromLine,
  ArrowRightToLine,
  AtSign,
  AudioLines,
  Brain,
  CheckCircle,
  CheckCircle2,
  Columns2,
  Copy,
  Crop,
  Download,
  Eye,
  FileText,
  FileVideo,
  Film,
  GitBranch,
  Grid3X3,
  Image,
  Layers,
  LayoutGrid,
  Loader2,
  Lock,
  Maximize,
  Maximize2,
  MessageSquare,
  Mic,
  Navigation,
  Pencil,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Scissors,
  Share2,
  Sparkles,
  Square,
  Subtitles,
  Unlock,
  Video,
  Volume2,
  Wand2,
} from 'lucide-react';
import {
  Children,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { generateHandlesFromSchema } from '../lib/schemaHandles';
import { useExecutionStore } from '../stores/executionStore';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflowStore';
import { Button } from '../ui/button';
import { NodeErrorBoundary } from './NodeErrorBoundary';
import { PreviewTooltip } from './PreviewTooltip';

// Icon mapping
const ICON_MAP: Record<string, typeof Image> = {
  ArrowLeftFromLine,
  // Composition icons
  ArrowRightToLine,
  AtSign,
  AudioLines,
  Brain,
  CheckCircle,
  Columns2,
  Crop,
  Download,
  Eye,
  FileText,
  FileVideo,
  Film,
  GitBranch,
  Grid3X3,
  Image,
  Layers,
  LayoutGrid,
  Maximize,
  Maximize2,
  MessageSquare,
  Mic,
  Navigation,
  Pencil,
  Puzzle,
  RefreshCw,
  Scissors,
  Share2,
  Sparkles,
  Subtitles,
  Video,
  Volume2,
  Wand2,
};

// Handle color CSS variables (used inline for guaranteed override)
const HANDLE_COLORS: Record<string, string> = {
  audio: 'var(--handle-audio)',
  image: 'var(--handle-image)',
  number: 'var(--handle-number)',
  text: 'var(--handle-text)',
  video: 'var(--handle-video)',
};

// Status indicator component
function StatusIndicator({ status }: { status: NodeStatus }) {
  switch (status) {
    case 'processing':
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    case 'complete':
      return <CheckCircle2 className="h-4 w-4 text-chart-2" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    default:
      return null;
  }
}

interface BaseNodeProps extends NodeProps {
  children?: ReactNode;
  headerActions?: ReactNode;
  title?: string;
  titleElement?: ReactNode;
  /** When true, hides the status indicator / stop button in the header (AI gen nodes manage their own) */
  hideStatusIndicator?: boolean;
  /** Input handle IDs that should appear disabled (reduced opacity) when model doesn't support them */
  disabledInputs?: string[];
}

// Hover delay for showing preview tooltip (ms)
const HOVER_DELAY = 300;

// Node dimension constraints
const NODE_MIN_WIDTH = 220;
const NODE_RESIZER_MAX_WIDTH = 500;
const DOWNLOAD_NODE_MIN_WIDTH = 200;
const DOWNLOAD_NODE_MIN_HEIGHT = 280;
const NODE_MIN_HEIGHT = 100;

function BaseNodeComponent({
  id,
  type,
  data,
  selected,
  children,
  headerActions,
  title,
  titleElement,
  hideStatusIndicator,
  width,
  height,
  disabledInputs,
}: BaseNodeProps) {
  // Check if node has been manually resized (has explicit dimensions)
  const isResized = width !== undefined || height !== undefined;
  const selectNode = useUIStore((state) => state.selectNode);
  const selectedNodeId = useUIStore((state) => state.selectedNodeId);
  const highlightedNodeIds = useUIStore((state) => state.highlightedNodeIds);
  const toggleNodeLock = useWorkflowStore((state) => state.toggleNodeLock);
  const isNodeLocked = useWorkflowStore((state) => state.isNodeLocked);
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);
  const isRunning = useExecutionStore((state) => state.isRunning);
  const stopExecution = useExecutionStore((state) => state.stopExecution);
  const stopNodeExecution = useExecutionStore(
    (state) => state.stopNodeExecution,
  );
  const updateNodeInternals = useUpdateNodeInternals();
  const nodeDef = NODE_DEFINITIONS[type as NodeType];
  const nodeData = data as WorkflowNodeData;

  // Hover preview tooltip state
  const nodeRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  // Generate dynamic handles from model schema (for AI nodes like imageGen, videoGen)
  // Falls back to static handles from NODE_DEFINITIONS if no schema present
  const selectedModel = (nodeData as { selectedModel?: SelectedModel })
    .selectedModel;
  const sortedInputs = useMemo(() => {
    const staticInputs = nodeDef?.inputs ?? [];
    if (!selectedModel?.inputSchema) return staticInputs;
    return generateHandlesFromSchema(selectedModel.inputSchema, staticInputs);
  }, [nodeDef?.inputs, selectedModel?.inputSchema]);

  const _disabledInputsKey = disabledInputs?.join(',') ?? '';
  const handlesKey = useMemo(() => {
    const inputKey = sortedInputs
      .map((input) => `${input.id}:${input.type}`)
      .join('|');
    const outputKey =
      nodeDef?.outputs
        ?.map((output) => `${output.id}:${output.type}`)
        .join('|') ?? '';
    return `${inputKey}__${outputKey}__${_disabledInputsKey}`;
  }, [sortedInputs, nodeDef?.outputs, _disabledInputsKey]);

  const normalizedHeaderActions = useMemo(
    () => (headerActions ? Children.toArray(headerActions) : null),
    [headerActions],
  );

  const normalizedChildren = useMemo(
    () => Children.toArray(children),
    [children],
  );

  // Force React Flow to recalculate handle positions when handle configuration changes
  // Only re-run when actual handle-affecting properties change, not on every render
  useEffect(() => {
    void handlesKey;
    const rafId = requestAnimationFrame(() => {
      updateNodeInternals(id);
    });
    return () => cancelAnimationFrame(rafId);
  }, [id, updateNodeInternals, handlesKey]);

  // Determine if this node should be highlighted (no selection = all highlighted)
  const isHighlighted =
    highlightedNodeIds.length === 0 || highlightedNodeIds.includes(id);

  const nodeExecuting = useExecutionStore((state) =>
    state.activeNodeExecutions.has(id),
  );

  const handleRetry = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!nodeExecuting) {
        // Clear error and set to processing before retrying
        updateNodeData(id, {
          error: undefined,
          status: NodeStatusEnum.PROCESSING,
        });
        executeNode(id);
      }
    },
    [id, nodeExecuting, executeNode, updateNodeData],
  );

  const handleStopNode = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isRunning) {
        // Global workflow execution — stop everything
        stopExecution();
      } else if (nodeExecuting) {
        // Independent node execution — stop only this node
        stopNodeExecution(id);
      } else {
        // No execution running — just reset UI status
        updateNodeData(id, { error: undefined, status: NodeStatusEnum.IDLE });
      }
    },
    [
      id,
      isRunning,
      nodeExecuting,
      stopExecution,
      stopNodeExecution,
      updateNodeData,
    ],
  );

  const handleCopyError = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (nodeData.error) {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(nodeData.error);
        } else {
          const textArea = document.createElement('textarea');
          textArea.value = nodeData.error;
          textArea.style.position = 'fixed';
          textArea.style.opacity = '0';
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        }
      }
    },
    [nodeData.error],
  );

  // Hover handlers for preview tooltip
  const handleMouseEnter = useCallback(() => {
    // Start delay timer
    hoverTimeoutRef.current = setTimeout(() => {
      if (nodeRef.current) {
        setAnchorRect(nodeRef.current.getBoundingClientRect());
      }
      setShowTooltip(true);
    }, HOVER_DELAY);
  }, []);

  const handleMouseLeave = useCallback(() => {
    // Clear timeout if not yet shown
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setShowTooltip(false);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);

  if (!nodeDef) return null;

  const Icon = ICON_MAP[nodeDef.icon] ?? Sparkles;
  const isSelected = selected || selectedNodeId === id;
  const isLocked = isNodeLocked(id);

  const handleLockToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleNodeLock(id);
  };

  // Category CSS variables (for processing glow, resizer handles)
  const categoryCssVars: Record<string, string> = {
    ai: 'var(--category-ai)',
    composition: 'var(--category-composition)',
    input: 'var(--category-input)',
    output: 'var(--category-output)',
    processing: 'var(--category-processing)',
  };

  const categoryColor =
    categoryCssVars[nodeDef.category] ?? categoryCssVars.input;
  // Use custom node color if set, otherwise fall back to category color
  const customColor = nodeData.color;
  const effectiveColor = customColor || categoryColor;

  const isProcessing = nodeData.status === 'processing';

  return (
    <>
      {/* Resizer - only shown when selected and not locked */}
      <NodeResizer
        isVisible={isSelected && !isLocked}
        minWidth={
          type === 'download' ? DOWNLOAD_NODE_MIN_WIDTH : NODE_MIN_WIDTH
        }
        minHeight={
          type === 'download' ? DOWNLOAD_NODE_MIN_HEIGHT : NODE_MIN_HEIGHT
        }
        maxWidth={NODE_RESIZER_MAX_WIDTH}
        lineClassName="!border-transparent"
        handleClassName="!w-2.5 !h-2.5 !border-0 !rounded-sm"
        handleStyle={{ backgroundColor: effectiveColor }}
      />
      <div
        ref={nodeRef}
        className={clsx(
          'relative flex flex-col rounded-lg bg-[var(--card)] shadow-lg transition-all duration-200',
          // Only apply min/max width if node hasn't been manually resized
          // Output nodes get larger minimums for better preview visibility
          !isResized && type === 'download' && 'min-w-[200px] min-h-[280px]',
          !isResized && type !== 'download' && 'min-w-[220px] max-w-[320px]',
          isSelected && 'ring-1',
          isLocked && 'opacity-60',
          isProcessing && 'node-processing',
          !isHighlighted && !isSelected && 'opacity-40',
          // Use custom border color when set, otherwise default border
          customColor ? 'border-2' : 'border border-[var(--border)]',
        )}
        style={
          {
            // Category color used for processing glow animation
            '--node-color': effectiveColor,
            // Selection ring matches effective color
            ...(isSelected && { '--tw-ring-color': effectiveColor }),
            // Custom border color when set
            ...(customColor && { borderColor: customColor }),
            // When resized, use explicit dimensions
            ...(isResized && {
              height: height ? `${height}px` : undefined,
              width: width ? `${width}px` : undefined,
            }),
          } as React.CSSProperties
        }
        onClick={() => selectNode(id)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Input Handles - positioned relative to outer wrapper (not flex) */}
        {sortedInputs.map((input: HandleDefinition, index: number) => {
          const isDisabled = disabledInputs?.includes(input.id);
          return (
            <Handle
              key={input.id}
              type="target"
              position={Position.Left}
              id={input.id}
              isConnectableEnd={!isDisabled}
              className={clsx('!w-3 !h-3', isDisabled && 'opacity-30')}
              style={{
                background: HANDLE_COLORS[input.type],
                top: `${((index + 1) / (sortedInputs.length + 1)) * 100}%`,
              }}
            />
          );
        })}

        {/* Output Handles - positioned relative to outer wrapper (not flex) */}
        {nodeDef.outputs.map((output: HandleDefinition, index: number) => (
          <Handle
            key={output.id}
            type="source"
            position={Position.Right}
            id={output.id}
            className="!w-3 !h-3 handle-output"
            style={{
              top: `${((index + 1) / (nodeDef.outputs.length + 1)) * 100}%`,
            }}
          />
        ))}

        {/* Content wrapper - flex column, scrolls when resized */}
        <div
          className={clsx(
            'flex flex-col',
            isResized && 'flex-1 min-h-0 overflow-auto',
          )}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
            <Icon className="h-4 w-4 text-foreground" />
            {titleElement ?? (
              <span className="flex-1 truncate text-sm font-medium text-left text-foreground">
                {title ?? nodeData.label}
              </span>
            )}
            {!hideStatusIndicator &&
              (isProcessing ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleStopNode}
                  className="text-destructive hover:bg-destructive/20 hover:text-destructive"
                  title={
                    isRunning
                      ? 'Stop execution'
                      : nodeExecuting
                        ? 'Stop node'
                        : 'Reset node'
                  }
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </Button>
              ) : (
                <StatusIndicator status={nodeData.status} />
              ))}
            {/* Lock Toggle Button - before headerActions so icon buttons are on the left */}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleLockToggle}
              className={isLocked ? 'text-chart-3' : 'text-muted-foreground'}
              title={isLocked ? 'Unlock node (L)' : 'Lock node (L)'}
            >
              {isLocked ? (
                <Lock className="h-4 w-4" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
            </Button>
            {normalizedHeaderActions}
          </div>

          {/* Content - wrapped with error boundary to prevent crashes from taking down canvas */}
          <div className="flex-1 flex flex-col p-3 min-h-0">
            <NodeErrorBoundary nodeId={id} nodeType={type as string}>
              {/* Error message - rendered BEFORE children so it appears at top */}
              {nodeData.error && (
                <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-2">
                  <div className="flex items-start gap-1.5">
                    <p className="flex-1 text-xs text-destructive break-all">
                      {nodeData.error}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={handleCopyError}
                      className="flex-shrink-0 h-5 w-5 text-destructive/70 hover:bg-destructive/20 hover:text-destructive"
                      title="Copy error"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRetry}
                    disabled={nodeExecuting}
                    className="mt-2 w-full"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </Button>
                </div>
              )}

              {normalizedChildren}

              {/* Progress bar */}
              {nodeData.status === 'processing' &&
                nodeData.progress !== undefined && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${nodeData.progress}%` }}
                      />
                    </div>
                    <span className="mt-1 text-xs text-muted-foreground">
                      {nodeData.progress}%
                    </span>
                  </div>
                )}
            </NodeErrorBoundary>
          </div>
        </div>

        {/* Lock Badge */}
        {isLocked && (
          <div className="absolute -right-2 -top-2 rounded bg-chart-3 px-1.5 py-0.5 text-[10px] font-bold text-background">
            LOCKED
          </div>
        )}
      </div>

      {/* Preview Tooltip - shows on hover after delay */}
      <PreviewTooltip
        nodeType={type as NodeType}
        nodeData={nodeData}
        anchorRect={anchorRect}
        isVisible={showTooltip && !isSelected}
      />
    </>
  );
}

/**
 * Custom comparator for BaseNode to prevent unnecessary re-renders.
 * Only re-renders when meaningful properties change.
 */
function arePropsEqual(prev: BaseNodeProps, next: BaseNodeProps): boolean {
  // Always re-render if selection changes
  if (prev.selected !== next.selected) return false;

  // Always re-render if id or type changes (shouldn't happen often)
  if (prev.id !== next.id) return false;
  if (prev.type !== next.type) return false;

  // Check dimension changes
  if (prev.width !== next.width || prev.height !== next.height) return false;

  // Check headerActions reference (parent should memoize this)
  if (prev.headerActions !== next.headerActions) return false;

  // Check title/titleElement
  if (prev.title !== next.title) return false;
  if (prev.titleElement !== next.titleElement) return false;

  // Check hideStatusIndicator
  if (prev.hideStatusIndicator !== next.hideStatusIndicator) return false;

  // Check disabledInputs array (shallow compare)
  const prevDisabled = prev.disabledInputs ?? [];
  const nextDisabled = next.disabledInputs ?? [];
  if (prevDisabled.length !== nextDisabled.length) return false;
  for (let i = 0; i < prevDisabled.length; i++) {
    if (prevDisabled[i] !== nextDisabled[i]) return false;
  }

  // Shallow compare data object - check key properties that affect rendering
  const prevData = prev.data as Record<string, unknown>;
  const nextData = next.data as Record<string, unknown>;

  // Status affects StatusIndicator and processing glow
  if (prevData.status !== nextData.status) return false;

  // Progress affects progress bar
  if (prevData.progress !== nextData.progress) return false;

  // Error affects error display
  if (prevData.error !== nextData.error) return false;

  // Label affects title display
  if (prevData.label !== nextData.label) return false;

  // Color affects border styling
  if (prevData.color !== nextData.color) return false;

  // Children reference
  if (prev.children !== next.children) return false;

  return true;
}

export const BaseNode = memo(BaseNodeComponent, arePropsEqual);
