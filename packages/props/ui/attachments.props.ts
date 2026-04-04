import type { DragEvent } from 'react';

export interface AttachmentItem {
  id: string;
  ingredientId?: string;
  url?: string;
  previewUrl: string;
  file: File;
  name: string;
  kind: 'image' | 'video' | 'audio';
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  error?: string;
  progress?: number;
}

export interface ChatAttachment {
  ingredientId: string;
  url: string;
  name?: string;
  kind: 'image' | 'video' | 'audio';
}

export interface UseAttachmentsOptions {
  maxFiles?: number;
  maxFileSizeMb?: number;
  acceptedTypes?: string[];
  onUpload: (
    file: File,
    onProgress?: (pct: number) => void,
  ) => Promise<{ ingredientId: string; url: string }>;
}

export interface DragState {
  isActive: boolean;
}

export interface DragHandlers {
  onDragEnter: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
}

export interface UseAttachmentsReturn {
  attachments: AttachmentItem[];
  isUploading: boolean;
  dragState: DragState;
  addFiles: (files: File[]) => void;
  removeAttachment: (id: string) => void;
  clearAll: () => void;
  getCompletedAttachments: () => ChatAttachment[];
  dragHandlers: DragHandlers;
}
