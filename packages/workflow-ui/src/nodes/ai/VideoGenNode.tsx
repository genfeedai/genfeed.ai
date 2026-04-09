'use client';

import type { VideoGenNodeData, VideoModel } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { AlertCircle, Video } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useAIGenNode } from '../../hooks/useAIGenNode';
import { useAIGenNodeHeader } from '../../hooks/useAIGenNodeHeader';
import { useAutoLoadModelSchema } from '../../hooks/useAutoLoadModelSchema';
import { useCanGenerate } from '../../hooks/useCanGenerate';
import { useModelSelection } from '../../hooks/useModelSelection';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import {
  DEFAULT_VIDEO_MODEL,
  VIDEO_MODEL_ID_MAP,
  VIDEO_MODEL_MAP,
  VIDEO_MODELS,
} from '../../lib/models/registry';
import { useWorkflowUIConfig } from '../../provider';
import { useUIStore } from '../../stores/uiStore';
import { BaseNode } from '../BaseNode';
import { ProcessingOverlay } from '../ProcessingOverlay';
import { SchemaInputs } from '../SchemaInputs';

function VideoGenNodeComponent(props: NodeProps) {
  const { id, type, data } = props;
  const nodeData = data as VideoGenNodeData;
  const { ModelBrowserModal } = useWorkflowUIConfig();
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);
  const { handleGenerate, handleStop } = useNodeExecution(id);
  const { canGenerate } = useCanGenerate({
    inputSchema: nodeData.selectedModel?.inputSchema as
      | Record<string, unknown>
      | undefined,
    nodeId: id,
    nodeType: type as 'videoGen',
    schemaParams: nodeData.schemaParams,
  });

  const [isModelBrowserOpen, setIsModelBrowserOpen] = useState(false);

  // Use shared hook for model selection
  const { handleModelSelect } = useModelSelection<VideoModel, VideoGenNodeData>(
    {
      fallbackModel: DEFAULT_VIDEO_MODEL,
      modelMap: VIDEO_MODEL_MAP,
      nodeId: id,
    },
  );

  // Auto-load schema for default model if selectedModel is not set
  useAutoLoadModelSchema({
    currentModel: nodeData.model,
    modelIdMap: VIDEO_MODEL_ID_MAP,
    onModelSelect: handleModelSelect,
    selectedModel: nodeData.selectedModel,
  });

  // Shared schema/enum/image-support logic
  const {
    schemaProperties,
    enumValues,
    modelSupportsImageInput,
    handleSchemaParamChange,
    componentSchemas,
  } = useAIGenNode<VideoGenNodeData>({
    nodeId: id,
    schemaParams: nodeData.schemaParams,
    selectedModel: nodeData.selectedModel,
  });

  const handleExpand = useCallback(() => {
    openNodeDetailModal(id, 'preview');
  }, [id, openNodeDetailModal]);

  const modelDisplayName = useMemo(
    () =>
      nodeData.selectedModel?.displayName ||
      VIDEO_MODELS.find((m) => m.value === nodeData.model)?.label ||
      nodeData.model,
    [nodeData.selectedModel?.displayName, nodeData.model],
  );

  const isProcessing = nodeData.status === 'processing';

  const handleModelBrowse = useCallback(() => setIsModelBrowserOpen(true), []);

  const { titleElement, headerActions } = useAIGenNodeHeader({
    canGenerate,
    hasOutput: !!nodeData.outputVideo,
    isProcessing,
    modelDisplayName,
    onExpand: handleExpand,
    onGenerate: handleGenerate,
    onModelBrowse: handleModelBrowse,
    onStop: handleStop,
  });

  // Determine which inputs to disable based on model support
  const disabledInputs = useMemo(() => {
    if (modelSupportsImageInput) return undefined;
    return ['image', 'lastFrame'];
  }, [modelSupportsImageInput]);

  return (
    <BaseNode
      {...props}
      titleElement={titleElement}
      headerActions={headerActions}
      hideStatusIndicator
      disabledInputs={disabledInputs}
    >
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        {/* Dynamic Schema Inputs */}
        {schemaProperties && (
          <SchemaInputs
            schema={schemaProperties}
            values={nodeData.schemaParams ?? {}}
            onChange={handleSchemaParamChange}
            enumValues={enumValues}
            componentSchemas={componentSchemas}
            disabled={nodeData.status === 'processing'}
          />
        )}

        {/* Hint when model doesn't support image input */}
        {!modelSupportsImageInput && nodeData.inputImage && (
          <div className="text-xs text-amber-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            This model doesn&apos;t use image inputs
          </div>
        )}

        {/* Output Preview */}
        {nodeData.outputVideo ? (
          <div className="relative aspect-video w-full rounded-md overflow-hidden bg-black/20">
            <video
              src={nodeData.outputVideo}
              className="absolute inset-0 w-full h-full object-contain cursor-pointer"
              controls
            >
              <track kind="captions" />
            </video>
            {/* Processing overlay spinner */}
            {nodeData.status === 'processing' && (
              <ProcessingOverlay onStop={handleStop} />
            )}
          </div>
        ) : (
          <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-1 border border-dashed border-border/50 bg-secondary/20">
            <Video className="h-6 w-6 text-muted-foreground/50" />
            {nodeData.status === 'processing' && (
              <ProcessingOverlay onStop={handleStop} />
            )}
          </div>
        )}

        {/* Help text for required inputs */}
        {!canGenerate && nodeData.status !== 'processing' && (
          <div className="text-xs text-[var(--muted-foreground)] flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Connect a prompt to generate
          </div>
        )}
      </div>

      {/* Model Browser Modal */}
      {ModelBrowserModal && (
        <ModelBrowserModal
          isOpen={isModelBrowserOpen}
          onClose={() => setIsModelBrowserOpen(false)}
          onSelect={handleModelSelect}
          capabilities={['text-to-video', 'image-to-video']}
          title="Select Video Model"
        />
      )}
    </BaseNode>
  );
}

export const VideoGenNode = memo(VideoGenNodeComponent);
