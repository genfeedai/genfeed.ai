'use client';

import type {
  GridOutputFormat,
  ImageGridSplitNodeData,
} from '@genfeedai/types';
import { NodeStatusEnum } from '@genfeedai/types';
import type { NodeProps } from '@xyflow/react';
import { Download, Grid3X3, Loader2, RefreshCw } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useState } from 'react';
import { useExecutionStore } from '../../stores/executionStore';
import { useWorkflowStore } from '../../stores/workflowStore';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Slider } from '../../ui/slider';
import { BaseNode } from '../BaseNode';

const OUTPUT_FORMATS: { value: GridOutputFormat; label: string }[] = [
  { label: 'JPEG', value: 'jpg' },
  { label: 'PNG', value: 'png' },
  { label: 'WebP', value: 'webp' },
];

interface GridConfigurationProps {
  id: string;
  nodeData: ImageGridSplitNodeData;
  onColsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRowsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function GridConfiguration({
  id,
  nodeData,
  onColsChange,
  onRowsChange,
}: GridConfigurationProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label
          className="text-xs text-[var(--muted-foreground)]"
          htmlFor={`image-grid-rows-${id}`}
        >
          Rows
        </label>
        <input
          id={`image-grid-rows-${id}`}
          type="number"
          min="1"
          max="10"
          value={nodeData.gridRows}
          onChange={onRowsChange}
          className="w-full px-2 py-1.5 text-sm bg-[var(--background)] border border-[var(--border)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>
      <div>
        <label
          className="text-xs text-[var(--muted-foreground)]"
          htmlFor={`image-grid-columns-${id}`}
        >
          Columns
        </label>
        <input
          id={`image-grid-columns-${id}`}
          type="number"
          min="1"
          max="10"
          value={nodeData.gridCols}
          onChange={onColsChange}
          className="w-full px-2 py-1.5 text-sm bg-[var(--background)] border border-[var(--border)] rounded focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
        />
      </div>
    </div>
  );
}

function GridPreview({
  cols,
  rows,
  totalCells,
}: {
  cols: number;
  rows: number;
  totalCells: number;
}) {
  return (
    <div className="p-2 bg-[var(--background)] rounded border border-[var(--border)]">
      <div className="text-xs text-[var(--muted-foreground)] text-center">
        Output: {totalCells} images ({rows}×{cols} grid)
      </div>
      <div
        className="mt-2 grid gap-0.5 mx-auto w-20 aspect-square bg-[var(--border)] rounded overflow-hidden"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {Array.from({ length: totalCells }).map((_, index) => (
          <div
            key={`cell-${index + 1}`}
            className="bg-[var(--primary)]/20 text-[8px] flex items-center justify-center text-[var(--primary)]"
          >
            {index + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

interface GridOutputSettingsProps {
  id: string;
  nodeData: ImageGridSplitNodeData;
  onFormatChange: (value: string) => void;
  onInsetChange: (value: number[]) => void;
  onQualityChange: (value: number[]) => void;
}

function GridOutputSettings({
  id,
  nodeData,
  onFormatChange,
  onInsetChange,
  onQualityChange,
}: GridOutputSettingsProps) {
  return (
    <>
      <div>
        <div
          className="text-xs text-[var(--muted-foreground)]"
          id={`image-grid-border-inset-${id}`}
        >
          Border Inset: {nodeData.borderInset}px
        </div>
        <Slider
          aria-labelledby={`image-grid-border-inset-${id}`}
          value={[nodeData.borderInset]}
          min={0}
          max={50}
          onValueChange={onInsetChange}
          className="nodrag w-full"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label
            className="text-xs text-[var(--muted-foreground)]"
            htmlFor={`image-grid-format-${id}`}
          >
            Format
          </label>
          <Select value={nodeData.outputFormat} onValueChange={onFormatChange}>
            <SelectTrigger
              id={`image-grid-format-${id}`}
              className="nodrag h-8 w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTPUT_FORMATS.map((format) => (
                <SelectItem key={format.value} value={format.value}>
                  {format.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-[var(--muted-foreground)]">
            Quality: {nodeData.quality}%
          </label>
          <Slider
            value={[nodeData.quality]}
            min={1}
            max={100}
            onValueChange={onQualityChange}
            className="nodrag w-full"
          />
        </div>
      </div>
    </>
  );
}

interface OutputGalleryProps {
  gridCols: number;
  images: string[];
  onDownload: (index: number) => void;
  onDownloadAll: () => void;
  onPreviewToggle: (index: number) => void;
  onProcess: () => void;
  onPreviewClose: () => void;
  selectedPreview: number | null;
  status: ImageGridSplitNodeData['status'];
}

function OutputGallery({
  gridCols,
  images,
  onDownload,
  onDownloadAll,
  onPreviewClose,
  onPreviewToggle,
  onProcess,
  selectedPreview,
  status,
}: OutputGalleryProps) {
  const selectedImage =
    selectedPreview !== null ? images[selectedPreview] : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--muted-foreground)]">
          Output ({images.length} images)
        </span>
        <Button
          variant="link"
          size="sm"
          onClick={onDownloadAll}
          className="h-auto p-0"
        >
          <Download className="size-3" />
          Download All
        </Button>
      </div>
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${Math.min(gridCols, 4)}, 1fr)`,
        }}
      >
        {images.map((img, index) => (
          <div
            key={img}
            className="relative group aspect-square rounded overflow-hidden border border-[var(--border)] cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => onPreviewToggle(index)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onPreviewToggle(index);
              }
            }}
          >
            <Image
              src={img}
              alt={`Cell ${index + 1}`}
              fill
              className="size-full object-cover"
              sizes="64px"
              unoptimized
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownload(index);
                }}
                className="size-6 bg-white/20 hover:bg-white/30"
              >
                <Download className="size-3 text-white" />
              </Button>
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] text-center py-0.5">
              {index + 1}
            </div>
          </div>
        ))}
      </div>
      {selectedPreview !== null && selectedImage && (
        <div className="relative">
          <Image
            src={selectedImage}
            alt={`Preview ${selectedPreview + 1}`}
            width={320}
            height={240}
            className="h-auto w-full rounded border border-[var(--border)]"
            unoptimized
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onPreviewClose}
            className="absolute top-1 right-1 size-5 bg-black/50 hover:bg-black/70 text-white"
          >
            ×
          </Button>
        </div>
      )}
      <SplitButton
        inputImage
        onProcess={onProcess}
        status={status}
        variant="resplit"
      />
    </div>
  );
}

function SplitButton({
  inputImage,
  onProcess,
  status,
  variant,
}: {
  inputImage?: string | boolean | null;
  onProcess: () => void;
  status: ImageGridSplitNodeData['status'];
  variant: 'split' | 'resplit';
}) {
  const isProcessing = status === 'processing';

  return (
    <Button
      variant={variant === 'resplit' ? 'secondary' : 'default'}
      size="sm"
      onClick={onProcess}
      disabled={!inputImage || isProcessing}
      className="w-full"
    >
      {variant === 'resplit' ? (
        <RefreshCw className="size-3" />
      ) : isProcessing ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Grid3X3 className="size-4" />
      )}
      {variant === 'resplit'
        ? 'Re-split'
        : isProcessing
          ? 'Splitting...'
          : 'Split Image'}
    </Button>
  );
}

function ImageGridSplitNodeComponent(props: NodeProps) {
  const { id, data } = props;
  const nodeData = data as ImageGridSplitNodeData;
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const executeNode = useExecutionStore((state) => state.executeNode);
  const [selectedPreview, setSelectedPreview] = useState<number | null>(null);

  const handleRowsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Math.min(
        10,
        Math.max(1, Number.parseInt(e.target.value, 10) || 1),
      );
      updateNodeData<ImageGridSplitNodeData>(id, { gridRows: value });
    },
    [id, updateNodeData],
  );

  const handleColsChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = Math.min(
        10,
        Math.max(1, Number.parseInt(e.target.value, 10) || 1),
      );
      updateNodeData<ImageGridSplitNodeData>(id, { gridCols: value });
    },
    [id, updateNodeData],
  );

  const handleInsetChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<ImageGridSplitNodeData>(id, {
        borderInset: value,
      });
    },
    [id, updateNodeData],
  );

  const handleFormatChange = useCallback(
    (value: string) => {
      updateNodeData<ImageGridSplitNodeData>(id, {
        outputFormat: value as GridOutputFormat,
      });
    },
    [id, updateNodeData],
  );

  const handleQualityChange = useCallback(
    ([value]: number[]) => {
      updateNodeData<ImageGridSplitNodeData>(id, {
        quality: value,
      });
    },
    [id, updateNodeData],
  );

  const handleProcess = useCallback(() => {
    updateNodeData(id, { status: NodeStatusEnum.PROCESSING });
    executeNode(id);
  }, [id, executeNode, updateNodeData]);

  const handleDownload = useCallback(
    (index: number) => {
      const image = nodeData.outputImages[index];
      if (!image) return;

      const link = document.createElement('a');
      link.href = image;
      link.download = `grid_${index + 1}.${nodeData.outputFormat}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [nodeData.outputImages, nodeData.outputFormat],
  );

  const handleDownloadAll = useCallback(() => {
    nodeData.outputImages.forEach((_, index) => {
      setTimeout(() => handleDownload(index), index * 100);
    });
  }, [nodeData.outputImages, handleDownload]);

  const handlePreviewToggle = useCallback((index: number) => {
    setSelectedPreview((current) => (current === index ? null : index));
  }, []);

  const totalCells = nodeData.gridRows * nodeData.gridCols;

  return (
    <BaseNode {...props}>
      <div className="space-y-3">
        <GridConfiguration
          id={id}
          nodeData={nodeData}
          onColsChange={handleColsChange}
          onRowsChange={handleRowsChange}
        />
        <GridPreview
          cols={nodeData.gridCols}
          rows={nodeData.gridRows}
          totalCells={totalCells}
        />
        <GridOutputSettings
          id={id}
          nodeData={nodeData}
          onFormatChange={handleFormatChange}
          onInsetChange={handleInsetChange}
          onQualityChange={handleQualityChange}
        />
        {nodeData.outputImages.length > 0 && (
          <OutputGallery
            gridCols={nodeData.gridCols}
            images={nodeData.outputImages}
            onDownload={handleDownload}
            onDownloadAll={handleDownloadAll}
            onPreviewClose={() => setSelectedPreview(null)}
            onPreviewToggle={handlePreviewToggle}
            onProcess={handleProcess}
            selectedPreview={selectedPreview}
            status={nodeData.status}
          />
        )}
        {nodeData.outputImages.length === 0 && (
          <SplitButton
            inputImage={nodeData.inputImage}
            onProcess={handleProcess}
            status={nodeData.status}
            variant="split"
          />
        )}
        {!nodeData.inputImage && nodeData.outputImages.length === 0 && (
          <div className="text-xs text-[var(--muted-foreground)] text-center">
            Connect an image input to split
          </div>
        )}
      </div>
    </BaseNode>
  );
}

export const ImageGridSplitNode = memo(ImageGridSplitNodeComponent);
