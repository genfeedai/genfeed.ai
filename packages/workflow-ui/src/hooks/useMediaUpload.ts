import type { WorkflowNodeData } from '@genfeedai/types';
import { useCallback, useRef, useState } from 'react';
import { getImageDimensions, getVideoMetadata } from '../lib/media';
import { useWorkflowUIConfig } from '../provider/WorkflowUIProvider';
import { useWorkflowStore } from '../stores/workflowStore';

interface UseMediaUploadOptions<T extends WorkflowNodeData> {
  nodeId: string;
  mediaType: 'image' | 'video';
  initialUrl?: string;
  getMetadata: (src: string) => Promise<Record<string, unknown>>;
  buildUploadUpdate: (
    url: string,
    filename: string,
    metadata: Record<string, unknown>,
  ) => Partial<T>;
  buildUrlUpdate: (
    url: string,
    metadata: Record<string, unknown> | null,
  ) => Partial<T>;
  buildRemoveUpdate: () => Partial<T>;
}

/**
 * Read a file as base64 data URL and apply metadata + update.
 */
function readFileAsBase64<T extends WorkflowNodeData>(
  file: File,
  nodeId: string,
  getMetadata: (src: string) => Promise<Record<string, unknown>>,
  buildUploadUpdate: (
    url: string,
    filename: string,
    metadata: Record<string, unknown>,
  ) => Partial<T>,
  updateNodeData: <U extends WorkflowNodeData>(
    id: string,
    data: Partial<U>,
  ) => void,
  onComplete?: () => void,
): void {
  const reader = new FileReader();
  reader.onload = async (event) => {
    const dataUrl = event.target?.result as string;
    const metadata = await getMetadata(dataUrl);
    updateNodeData<T>(nodeId, buildUploadUpdate(dataUrl, file.name, metadata));
    onComplete?.();
  };
  reader.readAsDataURL(file);
}

export function useMediaUpload<T extends WorkflowNodeData>({
  nodeId,
  mediaType,
  initialUrl = '',
  getMetadata,
  buildUploadUpdate,
  buildUrlUpdate,
  buildRemoveUpdate,
}: UseMediaUploadOptions<T>) {
  const updateNodeData = useWorkflowStore((state) => state.updateNodeData);
  const workflowId = useWorkflowStore((state) => state.workflowId);
  const { fileUpload } = useWorkflowUIConfig();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState(initialUrl);
  const [isUploading, setIsUploading] = useState(false);

  // Refs for builder functions to keep callbacks stable
  const getMetadataRef = useRef(getMetadata);
  getMetadataRef.current = getMetadata;
  const buildUploadUpdateRef = useRef(buildUploadUpdate);
  buildUploadUpdateRef.current = buildUploadUpdate;
  const buildUrlUpdateRef = useRef(buildUrlUpdate);
  buildUrlUpdateRef.current = buildUrlUpdate;
  const buildRemoveUpdateRef = useRef(buildRemoveUpdate);
  buildRemoveUpdateRef.current = buildRemoveUpdate;

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (workflowId && fileUpload) {
        setIsUploading(true);
        try {
          const result = await fileUpload.uploadFile(
            `/files/workflows/${workflowId}/input/${mediaType}`,
            file,
          );

          const metadata = await getMetadataRef.current(result.url);
          updateNodeData<T>(
            nodeId,
            buildUploadUpdateRef.current(result.url, result.filename, metadata),
          );
        } catch (_error) {
          // Fallback to Base64 if upload fails
          readFileAsBase64<T>(
            file,
            nodeId,
            getMetadataRef.current,
            buildUploadUpdateRef.current,
            updateNodeData,
          );
        } finally {
          setIsUploading(false);
        }
      } else {
        // Workflow not saved yet or no upload service - use Base64
        readFileAsBase64<T>(
          file,
          nodeId,
          getMetadataRef.current,
          buildUploadUpdateRef.current,
          updateNodeData,
        );
      }
    },
    [nodeId, updateNodeData, workflowId, mediaType, fileUpload],
  );

  const handleRemove = useCallback(() => {
    updateNodeData<T>(nodeId, buildRemoveUpdateRef.current());
    setUrlValue('');
  }, [nodeId, updateNodeData]);

  const handleUrlSubmit = useCallback(async () => {
    if (!urlValue.trim()) return;

    try {
      let metadata: Record<string, unknown>;
      if (mediaType === 'image') {
        metadata = await getImageDimensions(urlValue);
      } else {
        const meta = await getVideoMetadata(urlValue);
        metadata = {
          duration: meta.duration,
          height: meta.dimensions.height,
          width: meta.dimensions.width,
        };
      }
      updateNodeData<T>(nodeId, buildUrlUpdateRef.current(urlValue, metadata));
    } catch (_error) {
      updateNodeData<T>(nodeId, buildUrlUpdateRef.current(urlValue, null));
    }
    setShowUrlInput(false);
  }, [nodeId, updateNodeData, urlValue, mediaType]);

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleUrlSubmit();
      } else if (e.key === 'Escape') {
        setShowUrlInput(false);
        setUrlValue(initialUrl);
      }
    },
    [handleUrlSubmit, initialUrl],
  );

  return {
    fileInputRef,
    handleFileSelect,
    handleRemove,
    handleUrlKeyDown,
    handleUrlSubmit,
    isUploading,
    setShowUrlInput,
    setUrlValue,
    showUrlInput,
    urlValue,
  };
}
