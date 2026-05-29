'use client';

import { UploadStatus } from '@genfeedai/enums';
import type { FileUploadStatus } from '@genfeedai/interfaces/modals/file-upload-status.interface';
import Badge from '@ui/display/badge/Badge';

type FileStatusVariant = 'success' | 'error' | 'info' | 'ghost';

function getStatusBadgeVariant(
  status: FileUploadStatus['status'],
): FileStatusVariant {
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

function getStatusBadgeLabel(fileStatus: FileUploadStatus): string {
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

function formatSize(bytes: number): string {
  const kb = bytes / 1024;
  const mb = kb / 1024;
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  if (kb >= 1) {
    return `${Math.ceil(kb)} KB`;
  }
  return `${bytes} B`;
}

type TrainingFileListProps = {
  files: File[];
  fileStatuses: Map<string, FileUploadStatus>;
  maxSize: number;
  completedCount: number;
  uploadingCount: number;
  failedCount: number;
};

export default function TrainingFileList({
  files,
  fileStatuses,
  maxSize,
  completedCount,
  uploadingCount,
  failedCount,
}: TrainingFileListProps) {
  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Uploaded Files</h4>
        {files.length > 0 && (
          <div className="flex gap-2">
            {completedCount > 0 && (
              <Badge variant="success" className="text-xs">
                {completedCount} completed
              </Badge>
            )}

            {uploadingCount > 0 && (
              <Badge variant="info" className="text-xs">
                {uploadingCount} uploading
              </Badge>
            )}

            {failedCount > 0 && (
              <Badge variant="error" className="text-xs">
                {failedCount} failed
              </Badge>
            )}
          </div>
        )}
      </div>

      {files.length === 0 ? (
        <div className="flex items-center justify-center h-full min-h-52 border-2 border-dashed border-white/[0.08]">
          <p className="text-sm opacity-50">
            No files uploaded yet. Upload at least 10 images to start.
          </p>
        </div>
      ) : (
        <ul className="space-y-2 overflow-y-auto max-h-96">
          {files.map((f) => {
            const fileStatus = Array.from(fileStatuses.values()).find(
              (status) => status.file.name === f.name,
            );

            return (
              <li
                key={`${f.name}-${f.size}-${f.lastModified}`}
                className="space-y-1 p-2 bg-background/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate max-w-56 text-sm" title={f.name}>
                    {f.name}
                  </span>

                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        f.size > maxSize * 1024 * 1024 ? 'error' : 'ghost'
                      }
                      className="whitespace-nowrap text-xs"
                    >
                      {formatSize(f.size)}
                    </Badge>
                    {fileStatus && (
                      <Badge
                        variant={getStatusBadgeVariant(fileStatus.status)}
                        className="text-xs whitespace-nowrap"
                      >
                        {getStatusBadgeLabel(fileStatus)}
                      </Badge>
                    )}
                  </div>
                </div>

                {fileStatus && fileStatus.status === UploadStatus.UPLOADING && (
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${fileStatus.progress}%` }}
                    />
                  </div>
                )}

                {fileStatus &&
                  fileStatus.status === UploadStatus.FAILED &&
                  fileStatus.error && (
                    <div className="text-xs text-error opacity-80">
                      {fileStatus.error}
                    </div>
                  )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
