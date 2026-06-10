'use client';

import type {
  NodeType,
  PromptNodeData,
  WorkflowNodeData,
} from '@genfeedai/types';
import { NODE_DEFINITIONS } from '@genfeedai/types';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import Image from 'next/image';
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
} from 'react';
import { getMediaFromNode } from '../lib/mediaExtraction';
import { usePromptEditorStore } from '../stores/promptEditorStore';
import { useUIStore } from '../stores/uiStore';
import { useWorkflowStore } from '../stores/workflow';
import { Button } from '../ui/button';

// Node types that should open the prompt editor instead of preview
const PROMPT_NODE_TYPES: NodeType[] = ['prompt'];
const DEFAULT_PAN_OFFSET = { x: 0, y: 0 };

interface PreviewState {
  currentIndex: number;
  isPanning: boolean;
  panOffset: { x: number; y: number };
  panStart: { x: number; y: number };
  zoomLevel: number;
}

type PreviewAction =
  | { type: 'endPan' }
  | { type: 'goNext'; maxIndex: number }
  | { type: 'goPrevious' }
  | { type: 'movePan'; x: number; y: number }
  | { type: 'reset'; currentIndex: number }
  | { type: 'resetZoom' }
  | { type: 'startPan'; x: number; y: number }
  | { type: 'zoomIn' }
  | { type: 'zoomOut' };

const initialPreviewState: PreviewState = {
  currentIndex: 0,
  isPanning: false,
  panOffset: DEFAULT_PAN_OFFSET,
  panStart: DEFAULT_PAN_OFFSET,
  zoomLevel: 1,
};

function previewReducer(
  state: PreviewState,
  action: PreviewAction,
): PreviewState {
  switch (action.type) {
    case 'endPan':
      return { ...state, isPanning: false };
    case 'goNext':
      return {
        ...state,
        currentIndex: Math.min(state.currentIndex + 1, action.maxIndex),
        panOffset: DEFAULT_PAN_OFFSET,
        zoomLevel: 1,
      };
    case 'goPrevious':
      return {
        ...state,
        currentIndex: Math.max(state.currentIndex - 1, 0),
        panOffset: DEFAULT_PAN_OFFSET,
        zoomLevel: 1,
      };
    case 'movePan':
      if (!state.isPanning) return state;
      return {
        ...state,
        panOffset: {
          x: action.x - state.panStart.x,
          y: action.y - state.panStart.y,
        },
      };
    case 'reset':
      return {
        ...initialPreviewState,
        currentIndex: action.currentIndex,
      };
    case 'resetZoom':
      return { ...state, panOffset: DEFAULT_PAN_OFFSET, zoomLevel: 1 };
    case 'startPan':
      return {
        ...state,
        isPanning: true,
        panStart: {
          x: action.x - state.panOffset.x,
          y: action.y - state.panOffset.y,
        },
      };
    case 'zoomIn':
      return { ...state, zoomLevel: Math.min(state.zoomLevel + 0.25, 4) };
    case 'zoomOut':
      return { ...state, zoomLevel: Math.max(state.zoomLevel - 0.25, 0.25) };
    default:
      return state;
  }
}

function NodeDetailHeader({
  displayUrl,
  nodeLabel,
  nodeTypeLabel,
  onClose,
  onDownload,
}: {
  displayUrl: string | null | undefined;
  nodeLabel: string;
  nodeTypeLabel: string;
  onClose: () => void;
  onDownload: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-medium text-foreground">{nodeLabel}</h2>
        <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
          {nodeTypeLabel}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {displayUrl && (
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download className="size-4 mr-1" />
            Download
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-5" />
        </Button>
      </div>
    </div>
  );
}

function MediaPreviewContent({
  displayUrl,
  mediaType,
  nodeLabel,
  panOffset,
  zoomLevel,
}: {
  displayUrl?: string | null;
  mediaType: string | null;
  nodeLabel: string;
  panOffset: { x: number; y: number };
  zoomLevel: number;
}) {
  if (!displayUrl) {
    return (
      <div className="text-muted-foreground text-center">
        <p className="text-lg">No preview available</p>
        <p className="text-sm mt-2">Generate content to see the preview</p>
      </div>
    );
  }

  return (
    <div
      className="transition-transform duration-100"
      style={{
        transform: `scale(${zoomLevel}) translate(${panOffset.x / zoomLevel}px, ${panOffset.y / zoomLevel}px)`,
      }}
    >
      {mediaType === 'image' && (
        <Image
          src={displayUrl}
          alt={nodeLabel}
          width={800}
          height={600}
          className="max-h-[calc(100vh-200px)] max-w-[calc(100vw-100px)] object-contain rounded-lg"
          unoptimized
        />
      )}
      {mediaType === 'video' && (
        <video
          src={displayUrl}
          aria-label={nodeLabel}
          controls
          autoPlay
          loop
          className="max-h-[calc(100vh-200px)] max-w-[calc(100vw-100px)] rounded-lg"
        >
          <track kind="captions" />
        </video>
      )}
    </div>
  );
}

function ImageNavigation({
  currentIndex,
  imageCount,
  onNext,
  onPrevious,
}: {
  currentIndex: number;
  imageCount: number;
  onNext: () => void;
  onPrevious: () => void;
}) {
  if (imageCount <= 1) return null;

  return (
    <>
      {currentIndex > 0 && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onPrevious}
          className="absolute left-4 top-1/2 -translate-y-1/2 bg-card/80 hover:bg-card border border-border shadow-md"
          title="Previous image (←)"
        >
          <ChevronLeft className="size-5" />
        </Button>
      )}
      {currentIndex < imageCount - 1 && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 bg-card/80 hover:bg-card border border-border shadow-md"
          title="Next image (→)"
        >
          <ChevronRight className="size-5" />
        </Button>
      )}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-card/80 border border-border rounded-full px-3 py-1 text-xs text-muted-foreground shadow-md">
        {currentIndex + 1} / {imageCount}
      </div>
    </>
  );
}

function ZoomControls({
  onReset,
  onZoomIn,
  onZoomOut,
  zoomLevel,
}: {
  onReset: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoomLevel: number;
}) {
  return (
    <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-card border border-border p-1">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onZoomOut}
        title="Zoom out (-)"
      >
        <ZoomOut className="size-4" />
      </Button>
      <span className="text-xs text-muted-foreground w-12 text-center">
        {Math.round(zoomLevel * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onZoomIn}
        title="Zoom in (+)"
      >
        <ZoomIn className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onReset}
        title="Reset zoom (0)"
      >
        Reset
      </Button>
    </div>
  );
}

interface PreviewSurfaceProps {
  currentIndex: number;
  displayUrl?: string | null;
  imageCount: number;
  isPanning: boolean;
  mediaType: string | null;
  nodeLabel: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  panOffset: { x: number; y: number };
  zoomLevel: number;
}

function PreviewSurface({
  currentIndex,
  displayUrl,
  imageCount,
  isPanning,
  mediaType,
  nodeLabel,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onNext,
  onPrevious,
  onResetZoom,
  onZoomIn,
  onZoomOut,
  panOffset,
  zoomLevel,
}: PreviewSurfaceProps) {
  return (
    <div
      className="relative size-full flex items-center justify-center bg-background overflow-hidden"
      role="application"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      style={{
        cursor: zoomLevel > 1 ? (isPanning ? 'grabbing' : 'grab') : 'default',
      }}
    >
      <MediaPreviewContent
        displayUrl={displayUrl}
        mediaType={mediaType}
        nodeLabel={nodeLabel}
        panOffset={panOffset}
        zoomLevel={zoomLevel}
      />
      <ImageNavigation
        currentIndex={currentIndex}
        imageCount={imageCount}
        onNext={onNext}
        onPrevious={onPrevious}
      />
      {displayUrl && mediaType === 'image' && (
        <ZoomControls
          onReset={onResetZoom}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          zoomLevel={zoomLevel}
        />
      )}
    </div>
  );
}

export function NodeDetailModal() {
  const {
    activeModal,
    nodeDetailNodeId,
    nodeDetailStartIndex,
    closeNodeDetailModal,
  } = useUIStore();
  const { getNodeById } = useWorkflowStore();
  const { openEditor } = usePromptEditorStore();

  const [previewState, dispatchPreview] = useReducer(
    previewReducer,
    initialPreviewState,
  );
  const { currentIndex, isPanning, panOffset, zoomLevel } = previewState;

  // Get the node being displayed
  const node = useMemo(() => {
    if (!nodeDetailNodeId) return null;
    return getNodeById(nodeDetailNodeId);
  }, [nodeDetailNodeId, getNodeById]);

  // Redirect prompt-type nodes to the prompt editor
  useEffect(() => {
    if (activeModal !== 'nodeDetail' || !node) return;

    if (PROMPT_NODE_TYPES.includes(node.type as NodeType)) {
      const promptData = node.data as PromptNodeData;
      closeNodeDetailModal();
      openEditor(node.id, promptData.prompt ?? '');
    }
  }, [activeModal, node, closeNodeDetailModal, openEditor]);

  // Get media info
  const mediaInfo = useMemo(() => {
    if (!node) return { type: null, url: null };
    return getMediaFromNode(
      node.type as NodeType,
      node.data as WorkflowNodeData,
    );
  }, [node]);

  // Get node definition
  const nodeDef = useMemo(() => {
    if (!node) return null;
    return NODE_DEFINITIONS[node.type as NodeType];
  }, [node]);

  // Derive display URL and image count for pagination
  const imageUrls = mediaInfo.urls ?? [];
  const hasMultipleImages = imageUrls.length > 1;
  const displayUrl = hasMultipleImages
    ? (imageUrls[currentIndex] ?? mediaInfo.url)
    : mediaInfo.url;

  const goToPrevious = useCallback(() => {
    dispatchPreview({ type: 'goPrevious' });
  }, []);

  const goToNext = useCallback(() => {
    dispatchPreview({ maxIndex: imageUrls.length - 1, type: 'goNext' });
  }, [imageUrls.length]);

  useEffect(() => {
    if (!nodeDetailNodeId) {
      return;
    }

    dispatchPreview({ currentIndex: nodeDetailStartIndex, type: 'reset' });
  }, [nodeDetailNodeId, nodeDetailStartIndex]);

  // Keyboard shortcuts
  const handleModalKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (activeModal !== 'nodeDetail') return;

    if (e.key === 'Escape') {
      closeNodeDetailModal();
    }
    if (e.key === '+' || e.key === '=') {
      dispatchPreview({ type: 'zoomIn' });
    }
    if (e.key === '-') {
      dispatchPreview({ type: 'zoomOut' });
    }
    if (e.key === '0') {
      dispatchPreview({ type: 'resetZoom' });
    }
    if (e.key === 'ArrowLeft') {
      dispatchPreview({ type: 'goPrevious' });
    }
    if (e.key === 'ArrowRight') {
      dispatchPreview({ maxIndex: imageUrls.length - 1, type: 'goNext' });
    }
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      handleModalKeyDown(e);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoomLevel > 1) {
        dispatchPreview({ type: 'startPan', x: e.clientX, y: e.clientY });
      }
    },
    [zoomLevel],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    dispatchPreview({ type: 'movePan', x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseUp = useCallback(() => {
    dispatchPreview({ type: 'endPan' });
  }, []);

  // Download handler
  const handleDownload = useCallback(() => {
    const url = displayUrl ?? mediaInfo.url;
    if (!url) return;

    const link = document.createElement('a');
    link.href = url;
    const suffix = hasMultipleImages ? `_${currentIndex + 1}` : '';
    link.download = `${node?.data.label || 'output'}${suffix}.${mediaInfo.type === 'video' ? 'mp4' : 'png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [displayUrl, mediaInfo, node, hasMultipleImages, currentIndex]);

  // Don't render for prompt nodes (they redirect to prompt editor)
  if (activeModal !== 'nodeDetail' || !node || !nodeDef) {
    return null;
  }

  // Prompt nodes are handled by the prompt editor
  if (PROMPT_NODE_TYPES.includes(node.type as NodeType)) {
    return null;
  }

  const nodeData = node.data as WorkflowNodeData;

  return (
    <>
      {/* Backdrop */}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="fixed inset-0 z-50 size-full bg-black/80 p-0 hover:bg-black/80"
        onClick={closeNodeDetailModal}
        aria-label="Close node detail preview"
      />

      {/* Modal */}
      <div className="fixed inset-4 z-50 flex flex-col bg-card border border-border shadow-xl overflow-hidden">
        <NodeDetailHeader
          displayUrl={displayUrl}
          nodeLabel={nodeData.label}
          nodeTypeLabel={nodeDef.label}
          onClose={closeNodeDetailModal}
          onDownload={handleDownload}
        />

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          <PreviewSurface
            currentIndex={currentIndex}
            displayUrl={displayUrl}
            imageCount={hasMultipleImages ? imageUrls.length : 0}
            isPanning={isPanning}
            mediaType={mediaInfo.type}
            nodeLabel={nodeData.label}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onNext={goToNext}
            onPrevious={goToPrevious}
            onResetZoom={() => dispatchPreview({ type: 'resetZoom' })}
            onZoomIn={() => dispatchPreview({ type: 'zoomIn' })}
            onZoomOut={() => dispatchPreview({ type: 'zoomOut' })}
            panOffset={panOffset}
            zoomLevel={zoomLevel}
          />
        </div>
      </div>
    </>
  );
}
