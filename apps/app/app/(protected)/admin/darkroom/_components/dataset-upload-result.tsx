'use client';

import Card from '@ui/card/Card';
import {
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle,
} from 'react-icons/hi2';
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
            <HiOutlineCheckCircle className="size-4" />
            {uploadResult.uploadedCount} image(s) uploaded successfully
          </div>
        )}
        {uploadResult.failedCount > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-error">
              <HiOutlineExclamationCircle className="size-4" />
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
