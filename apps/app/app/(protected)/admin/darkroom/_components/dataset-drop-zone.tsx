'use client';

import Badge from '@ui/display/badge/Badge';
import { Input } from '@ui/primitives/input';
import { HiOutlineCloudArrowUp } from 'react-icons/hi2';

type DatasetDropZoneProps = {
  getRootProps: (options?: object) => React.HTMLAttributes<HTMLDivElement>;
  getInputProps: () => React.InputHTMLAttributes<HTMLInputElement>;
  isDragActive: boolean;
};

export default function DatasetDropZone({
  getRootProps,
  getInputProps,
  isDragActive,
}: DatasetDropZoneProps) {
  return (
    <div
      {...getRootProps({
        className: `border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-foreground/15 hover:border-foreground/30 bg-foreground/[0.02]'
        }`,
      })}
    >
      <Input {...getInputProps()} />
      <HiOutlineCloudArrowUp className="size-10 mx-auto mb-3 text-foreground/40" />
      <p className="text-sm font-medium text-foreground/70">
        {isDragActive
          ? 'Drop files here...'
          : 'Drop training images + caption .txt files here'}
      </p>
      <p className="text-xs text-foreground/40 mt-1">
        Pair images with captions by matching filenames (e.g. photo1.png +
        photo1.txt)
      </p>
      <div className="flex items-center justify-center gap-2 mt-3">
        <Badge variant="ghost">JPG, PNG, WEBP</Badge>
        <Badge variant="ghost">+ .txt captions</Badge>
        <Badge variant="ghost">50MB max per file</Badge>
      </div>
    </div>
  );
}
