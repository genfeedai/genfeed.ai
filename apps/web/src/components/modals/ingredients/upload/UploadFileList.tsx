'use client';

import { CardPadding, UploadStatus } from '@genfeedai/contracts';
import type { FileUploadStatus } from '@genfeedai/contracts/interfaces/modals/file-upload-status.interface';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import Card from '@ui/card/Card';
import { Progress } from '@ui/primitives/progress';
import {
  Check,
  CircleAlert,
  FileAudio,
  FileVideo,
  ImageIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactElement, useEffect, useState } from 'react';

type Props = {
  selectedFileList: File[];
  fileStatuses: Map<string, FileUploadStatus>;
  formatSize: (bytes: number) => string;
};

function UploadFileThumb({ file }: { file: File }): ReactElement {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith('image/');

  useEffect(() => {
    if (!isImage) {
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file, isImage]);

  const Icon = file.type.startsWith('video/')
    ? FileVideo
    : file.type.startsWith('audio/')
      ? FileAudio
      : ImageIcon;

  return (
    <div
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background-tertiary bg-cover bg-center text-muted-foreground"
      data-testid="upload-file-thumb"
      style={
        previewUrl ? { backgroundImage: `url("${previewUrl}")` } : undefined
      }
    >
      {previewUrl ? null : <Icon className="size-4" />}
    </div>
  );
}

export default function UploadFileList({
  selectedFileList,
  fileStatuses,
  formatSize,
}: Props) {
  const translate = useTranslations('ui.uploadModal');

  return (
    <ul className="flex flex-col gap-1.5">
      {selectedFileList.map((file) => {
        const fileStatus = Array.from(fileStatuses.values()).find(
          (status) => status.file.name === file.name,
        );
        const status = fileStatus?.status;
        const isUploading = status === UploadStatus.UPLOADING;
        const isFailed = status === UploadStatus.FAILED;
        const isCompleted = status === UploadStatus.COMPLETED;

        return (
          <Card
            padding={CardPadding.SM}
            as="li"
            bodyClassName="flex-row items-center"
            key={`${file.name}-${file.size}-${file.lastModified}`}
          >
            <UploadFileThumb file={file} />

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="truncate text-sm font-medium"
                  title={file.name}
                >
                  {file.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatSize(file.size)}
                </span>
              </div>

              {isUploading ? (
                <Progress
                  aria-label={translate('uploadingFile', { name: file.name })}
                  size="xs"
                  value={fileStatus?.progress ?? 0}
                />
              ) : (
                <span
                  className={cn(
                    'text-xs',
                    isFailed ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {isFailed
                    ? (fileStatus?.error ?? translate('statusFailed'))
                    : isCompleted
                      ? translate('statusUploaded')
                      : translate('statusWaiting')}
                </span>
              )}
            </div>

            <div className="flex size-6 shrink-0 items-center justify-center">
              {isCompleted ? (
                <Check
                  aria-hidden="true"
                  className="size-4 text-success"
                  data-testid="upload-status-completed"
                />
              ) : null}
              {isFailed ? (
                <CircleAlert
                  aria-hidden="true"
                  className="size-4 text-destructive"
                  data-testid="upload-status-failed"
                />
              ) : null}
            </div>
          </Card>
        );
      })}
    </ul>
  );
}
