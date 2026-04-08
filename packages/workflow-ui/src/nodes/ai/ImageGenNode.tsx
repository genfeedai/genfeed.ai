'use client';

import type { ImageGenNodeData, ImageModel } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { AlertCircle, Download, ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useMemo, useState } from 'react';
import { useAIGenNode } from '../../hooks/useAIGenNode';
import { useAIGenNodeHeader } from '../../hooks/useAIGenNodeHeader';
import { useAutoLoadModelSchema } from '../../hooks/useAutoLoadModelSchema';
import { useCanGenerate } from '../../hooks/useCanGenerate';
import { useModelSelection } from '../../hooks/useModelSelection';
import { useNodeExecution } from '../../hooks/useNodeExecution';
import {
  DEFAULT_IMAGE_MODEL,
  IMAGE_MODEL_ID_MAP,
  IMAGE_MODEL_MAP,
  IMAGE_MODELS,
} from '../../lib/models/registry';
import { useWorkflowUIConfig } from '../../provider';
import { useUIStore } from '../../stores/uiStore';
import { Button } from '../../ui/button';
import { BaseNode } from '../BaseNode';
import { ProcessingOverlay } from '../ProcessingOverlay';
import { SchemaInputs } from '../SchemaInputs';

function ImageGenNodeComponent(props: NodeProps) {
  const { id, type, data } = props;
  const nodeData = data as ImageGenNodeData;
  const { ModelBrowserModal } = useWorkflowUIConfig();
  const openNodeDetailModal = useUIStore((state) => state.openNodeDetailModal);
  const { handleGenerate, handleStop } = useNodeExecution(id);
  const { canGenerate } = useCanGenerate({
    inputSchema: nodeData.selectedModel?.inputSchema as
      | Record<string, unknown>
      | undefined,
    nodeId: id,
    nodeType: type as 'imageGen',
    schemaParams: nodeData.schemaParams,
  });

  const [isModelBrowserOpen, setIsModelBrowserOpen] = useState(false);
  const [selectedPreview, setSelectedPreview] = useState<number | null>(null);

  // Download handlers for multi-image gallery
  const handleDownload = useCallback(
    (index: number) => {
      const images = nodeData.outputImages ?? [];
      const image = images[index];
      if (!image) return;

      const link = document.createElement('a');
      link.href = image;
      link.download = `generated_${index + 1}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [nodeData.outputImages],
  );

  const handleDownloadAll = useCallback(() => {
    const images = nodeData.outputImages ?? [];
    images.forEach((_, index) => {
      setTimeout(() => handleDownload(index), index * 100);
    });
  }, [nodeData.outputImages, handleDownload]);

  // Use shared hook for model selection
  const { handleModelSelect } = useModelSelection<ImageModel, ImageGenNodeData>(
    {
      fallbackModel: DEFAULT_IMAGE_MODEL,
      modelMap: IMAGE_MODEL_MAP,
      nodeId: id,
    },
  );

  // Auto-load schema for default model if selectedModel is not set
  useAutoLoadModelSchema({
    currentModel: nodeData.model,
    modelIdMap: IMAGE_MODEL_ID_MAP,
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
  } = useAIGenNode<ImageGenNodeData>({
    nodeId: id,
    schemaParams: nodeData.schemaParams,
    selectedModel: nodeData.selectedModel,
  });

  const handleExpand = useCallback(() => {
    openNodeDetailModal(id, 'preview', selectedPreview ?? 0);
  }, [id, openNodeDetailModal, selectedPreview]);

  const modelDisplayName = useMemo(
    () =>
      nodeData.selectedModel?.displayName ||
      IMAGE_MODELS.find((m) => m.value === nodeData.model)?.label ||
      nodeData.model,
    [nodeData.selectedModel?.displayName, nodeData.model],
  );

  const isProcessing = nodeData.status === 'processing';

  const handleModelBrowse = useCallback(() => setIsModelBrowserOpen(true), []);

  const { titleElement, headerActions } = useAIGenNodeHeader({
    canGenerate,
    hasOutput: !!nodeData.outputImage,
    isProcessing,
    modelDisplayName,
    onExpand: handleExpand,
    onGenerate: handleGenerate,
    onModelBrowse: handleModelBrowse,
    onStop: handleStop,
  });

  return (
    <BaseNode
      {...props}
      titleElement={titleElement}
      headerActions={headerActions}
      hideStatusIndicator
      disabledInputs={modelSupportsImageInput ? undefined : ['images']}
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
        {!modelSupportsImageInput && nodeData.inputImages.length > 0 && (
          <div className="text-xs text-amber-500 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            This model doesn&apos;t use image inputs
          </div>
        )}

        {/* Output Preview - Multi-image gallery or single image */}
        {(nodeData.outputImages?.length ?? 0) > 1 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Generated ({nodeData.outputImages.length} images)
              </span>
              <Button
                variant="link"
                size="sm"
                onClick={handleDownloadAll}
                className="h-auto p-0"
              >
                <Download className="w-3 h-3" />
                Download All
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-1">
              {nodeData.outputImages.map((img, i) => (
                <Button
                  key={img}
                  type="button"
                  variant="ghost"
                  className="relative group aspect-square overflow-hidden border border-border cursor-pointer h-auto p-0"
                  onClick={() =>
                    setSelectedPreview(selectedPreview === i ? null : i)
                  }
                >
                  <Image
                    src={img}
                    alt={`Generated ${i + 1}`}
                    fill
                    sizes="150px"
                    className="object-cover"
                    unoptimized
                  />

                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="h-6 w-6 bg-white/20 hover:bg-white/30"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(i);
                      }}
                    >
                      <Download className="w-3 h-3 text-white" />
                    </Button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] text-center py-0.5">
                    {i + 1}
                  </div>
                </Button>
              ))}
            </div>
            {/* Enlarged preview */}
            {selectedPreview !== null &&
              nodeData.outputImages[selectedPreview] && (
                <div className="relative aspect-[4/3] rounded overflow-hidden">
                  <Image
                    src={nodeData.outputImages[selectedPreview]}
                    alt={`Preview ${selectedPreview + 1}`}
                    fill
                    sizes="300px"
                    className="object-contain"
                    unoptimized
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setSelectedPreview(null)}
                    className="absolute top-1 right-1 h-5 w-5 bg-black/50 hover:bg-black/70 text-white"
                  >
                    x
                  </Button>
                </div>
              )}
            {/* Processing overlay */}
            {nodeData.status === 'processing' && <ProcessingOverlay />}
          </div>
        ) : nodeData.outputImage ? (
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-black/20">
            <Image
              src={nodeData.outputImage}
              alt="Generated image"
              fill
              sizes="300px"
              className="object-contain cursor-pointer"
              unoptimized
            />
            {/* Processing overlay spinner */}
            {nodeData.status === 'processing' && <ProcessingOverlay />}
          </div>
        ) : (
          <div className="relative flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 border border-dashed border-border/50 bg-secondary/20">
            <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
            {nodeData.status === 'processing' && <ProcessingOverlay />}
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
          capabilities={['text-to-image', 'image-to-image']}
          title="Select Image Model"
        />
      )}
    </BaseNode>
  );
}

export const ImageGenNode = memo(ImageGenNodeComponent);
