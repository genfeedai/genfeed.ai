import type {
  AttachmentItem,
  ChatAttachment,
  DragHandlers,
  DragState,
  UseAttachmentsOptions,
  UseAttachmentsReturn,
} from '@props/ui/attachments.props';
import type { DragEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_MAX_FILES = 4;
const DEFAULT_MAX_FILE_SIZE_MB = 10;
const DEFAULT_ACCEPTED_TYPES = ['image/*'];

function generateAttachmentId(): string {
  const randomUuid = globalThis.crypto?.randomUUID;
  if (typeof randomUuid === 'function') {
    return randomUuid.call(globalThis.crypto);
  }

  return `attachment-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 11)}`;
}

function inferKind(file: File): 'image' | 'video' | 'audio' {
  if (file.type.startsWith('video/')) {
    return 'video';
  }
  if (file.type.startsWith('audio/')) {
    return 'audio';
  }
  return 'image';
}

function isFileAccepted(file: File, acceptedTypes: string[]): boolean {
  return acceptedTypes.some((pattern) => {
    if (pattern.endsWith('/*')) {
      const prefix = pattern.slice(0, -1);
      return file.type.startsWith(prefix);
    }
    return file.type === pattern;
  });
}

function isFileDrag(event: DragEvent<HTMLDivElement>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export function useAttachments(
  options: UseAttachmentsOptions,
): UseAttachmentsReturn {
  const {
    maxFiles = DEFAULT_MAX_FILES,
    maxFileSizeMb = DEFAULT_MAX_FILE_SIZE_MB,
    acceptedTypes = DEFAULT_ACCEPTED_TYPES,
    onUpload,
  } = options;

  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [dragState, setDragState] = useState<DragState>({ isActive: false });
  const dragDepthRef = useRef(0);
  const previewUrlsRef = useRef<Set<string>>(new Set());

  const isUploading = attachments.some(
    (attachment) =>
      attachment.status === 'pending' || attachment.status === 'uploading',
  );

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      previewUrlsRef.current.clear();
    };
  }, []);

  const uploadFile = useCallback(
    async (item: AttachmentItem) => {
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === item.id ? { ...a, status: 'uploading' as const } : a,
        ),
      );

      try {
        const result = await onUpload(item.file, (pct: number) => {
          setAttachments((prev) =>
            prev.map((a) => (a.id === item.id ? { ...a, progress: pct } : a)),
          );
        });

        setAttachments((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? {
                  ...a,
                  ingredientId: result.ingredientId,
                  progress: 100,
                  status: 'completed' as const,
                  url: result.url,
                }
              : a,
          ),
        );
      } catch (err) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === item.id
              ? {
                  ...a,
                  error: err instanceof Error ? err.message : 'Upload failed',
                  status: 'failed' as const,
                }
              : a,
          ),
        );
      }
    },
    [onUpload],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const maxSizeBytes = maxFileSizeMb * 1024 * 1024;

      setAttachments((prev) => {
        const slotsAvailable = maxFiles - prev.length;
        if (slotsAvailable <= 0) {
          return prev;
        }

        const validFiles = files
          .filter(
            (file) =>
              isFileAccepted(file, acceptedTypes) && file.size <= maxSizeBytes,
          )
          .slice(0, slotsAvailable);

        const newItems: AttachmentItem[] = validFiles.map((file) => {
          const previewUrl = URL.createObjectURL(file);
          previewUrlsRef.current.add(previewUrl);
          return {
            file,
            id: generateAttachmentId(),
            kind: inferKind(file),
            name: file.name,
            previewUrl,
            progress: 0,
            status: 'pending' as const,
          };
        });

        // Kick off uploads for each new item
        for (const item of newItems) {
          void uploadFile(item);
        }

        return [...prev, ...newItems];
      });
    },
    [acceptedTypes, maxFiles, maxFileSizeMb, uploadFile],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        previewUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    setAttachments((prev) => {
      for (const item of prev) {
        URL.revokeObjectURL(item.previewUrl);
        previewUrlsRef.current.delete(item.previewUrl);
      }
      return [];
    });
  }, []);

  const getCompletedAttachments = useCallback((): ChatAttachment[] => {
    return attachments
      .filter(
        (a): a is AttachmentItem & { ingredientId: string; url: string } =>
          a.status === 'completed' &&
          a.ingredientId !== undefined &&
          a.url !== undefined,
      )
      .map((a) => ({
        ingredientId: a.ingredientId,
        kind: a.kind,
        name: a.name,
        url: a.url,
      }));
  }, [attachments]);

  const handleDragEnter = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setDragState({ isActive: true });
  }, []);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragState({ isActive: false });
    }
  }, []);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setDragState({ isActive: false });

      const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles);
      }
    },
    [addFiles],
  );

  const dragHandlers: DragHandlers = {
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
  };

  return {
    addFiles,
    attachments,
    clearAll,
    dragHandlers,
    dragState,
    getCompletedAttachments,
    isUploading,
    removeAttachment,
  };
}
