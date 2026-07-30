'use client';

import Card from '@ui/card/Card';
import { CircleAlert, CircleCheck } from 'lucide-react';

import type { UploadResult } from './dataset-uploader.types';

type DatasetUploadResultProps = {
  uploadResult: UploadResult;
};

export default function DatasetUploadResult({
  uploadResult,
}: DatasetUploadResultProps) {
  return (
    <Card>
      <div className="p-4 space-y-2">
        {uploadResult.uploadedCount > 0 && (
          <div className="flex items-center gap-2 text-sm text-success">
            <CircleCheck className="size-4" />
            {uploadResult.uploadedCount} image(s) uploaded successfully
          </div>
        )}
        {uploadResult.failedCount > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-error">
              <CircleAlert className="size-4" />
              {uploadResult.failedCount} image(s) failed
            </div>
            {uploadResult.failed.map((f) => (
              <div
                key={`${f.filename}-${f.error}`}
                className="text-xs text-error/70 ml-6"
              >
                {f.filename}: {f.error}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
