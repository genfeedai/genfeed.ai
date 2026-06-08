'use client';

import { UploadStatus } from '@genfeedai/enums';
import type { FileUploadStatus } from '@genfeedai/interfaces/modals/file-upload-status.interface';
import Badge from '@ui/display/badge/Badge';
import { getStatusBadgeLabel, getStatusBadgeVariant } from './upload.utils';

type Props = {
  selectedFileList: File[];
  maxFiles: number;
  maxSize: number;
  fileStatuses: Map<string, FileUploadStatus>;
  formatSize: (bytes: number) => string;
};

export default function UploadFileList({
  selectedFileList,
  maxFiles,
  maxSize,
  fileStatuses,
  formatSize,
}: Props) {
  return (
    <div className="text-left space-y-1">
      <div className="text-xs opacity-70">
        {selectedFileList.length} / {maxFiles} selected
      </div>
      <ul className="space-y-2">
        {selectedFileList.map((f) => {
          const fileStatus = Array.from(fileStatuses.values()).find(
            (status) => status.file.name === f.name,
          );

          return (
            <li
              key={`${f.name}-${f.size}-${f.lastModified}`}
              className="space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate max-w-52" title={f.name}>
                  {f.name}
                </span>

                <div className="flex items-center gap-2">
                  <Badge
                    variant={f.size > maxSize * 1024 * 1024 ? 'error' : 'ghost'}
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
    </div>
  );
}
