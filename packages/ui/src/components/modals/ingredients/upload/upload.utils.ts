import { UploadStatus } from '@genfeedai/enums';
import type { FileUploadStatus } from '@genfeedai/interfaces/modals/file-upload-status.interface';
import type { Dispatch, SetStateAction } from 'react';

type FileStatusUpdater = Dispatch<
  SetStateAction<Map<string, FileUploadStatus>>
>;

/**
 * Helper to update file status in the status map.
 */
export function updateFileStatus(
  setFileStatuses: FileStatusUpdater,
  fileId: string,
  updates: Partial<FileUploadStatus>,
): void {
  setFileStatuses((prev) => {
    const newMap = new Map(prev);
    const existing = newMap.get(fileId);
    if (existing) {
      newMap.set(fileId, { ...existing, ...updates });
    }
    return newMap;
  });
}

/**
 * Gets badge variant based on file upload status.
 */
export function getStatusBadgeVariant(
  status: FileUploadStatus['status'],
): 'success' | 'error' | 'info' | 'ghost' {
  switch (status) {
    case UploadStatus.COMPLETED:
      return 'success';
    case UploadStatus.FAILED:
      return 'error';
    case UploadStatus.UPLOADING:
      return 'info';
    default:
      return 'ghost';
  }
}

/**
 * Gets badge label based on file upload status.
 */
export function getStatusBadgeLabel(fileStatus: FileUploadStatus): string {
  switch (fileStatus.status) {
    case UploadStatus.UPLOADING:
      return `${fileStatus.progress}%`;
    case UploadStatus.COMPLETED:
      return '✓';
    case UploadStatus.FAILED:
      return '✗';
    default:
      return 'pending';
  }
}

/**
 * Gets max file size in MB based on category.
 */
export function getMaxFileSize(
  isImageLike: boolean,
  isAudioLike: boolean,
  isVideoLike: boolean,
): number {
  if (isImageLike) {
    return 10;
  }
  if (isAudioLike) {
    return 25;
  }
  if (isVideoLike) {
    return 50;
  }
  return 10;
}

/**
 * Gets accepted file extensions based on category.
 */
export function getAcceptedTypes(
  isImageLike: boolean,
  isVideoLike: boolean,
  isAudioLike: boolean,
): string[] {
  if (isImageLike) {
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
  }
  if (isVideoLike) {
    return ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
  }
  if (isAudioLike) {
    return ['.mp3', '.wav', '.aac', '.flac', '.ogg'];
  }
  return [];
}

/**
 * Gets dimension recommendation text based on width/height constraints.
 */
export function getDimensionText(width?: number, height?: number): string {
  if (width && height) {
    return `Recommended size: ${width}x${height}px`;
  }
  if (width) {
    return `Recommended width: ${width}px`;
  }
  if (height) {
    return `Recommended height: ${height}px`;
  }
  return '';
}
