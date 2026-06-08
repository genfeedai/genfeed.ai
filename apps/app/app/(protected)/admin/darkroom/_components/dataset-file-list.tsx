'use client';

import { ButtonVariant } from '@genfeedai/enums';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import {
  HiOutlineDocumentText,
  HiOutlinePhoto,
  HiOutlineTrash,
} from 'react-icons/hi2';
import type { PairedFile } from './dataset-uploader.types';

type DatasetFileListProps = {
  pairedFiles: PairedFile[];
  pairedCount: number;
  unpairedCount: number;
  onClearAll: () => void;
  onRemoveFile: (index: number) => void;
};

export default function DatasetFileList({
  pairedFiles,
  pairedCount,
  unpairedCount,
  onClearAll,
  onRemoveFile,
}: DatasetFileListProps) {
  return (
    <Card>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium">
              {pairedFiles.length} image
              {pairedFiles.length !== 1 ? 's' : ''}
            </span>
            {pairedCount > 0 && (
              <Badge variant="success">{pairedCount} with captions</Badge>
            )}
            {unpairedCount > 0 && (
              <Badge variant="ghost">{unpairedCount} without captions</Badge>
            )}
          </div>

          <Button
            variant={ButtonVariant.GHOST}
            className="text-xs text-foreground/50 hover:text-error"
            onClick={onClearAll}
          >
            Clear all
          </Button>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {pairedFiles.map((pair, index) => (
            <div
              key={`${pair.filenameStem}-${pair.image.name}-${pair.image.lastModified}`}
              className="flex items-center gap-3 p-2 rounded bg-foreground/[0.03] group"
            >
              {/* Thumbnail */}
              <div className="size-10 rounded overflow-hidden bg-foreground/5 flex-shrink-0">
                <Image
                  unoptimized
                  alt={pair.image.name}
                  className="w-full h-full object-cover"
                  src={URL.createObjectURL(pair.image)}
                  width={800}
                  height={600}
                />
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <HiOutlinePhoto className="size-3.5 text-foreground/40 flex-shrink-0" />
                  <span className="text-sm truncate" title={pair.image.name}>
                    {pair.image.name}
                  </span>
                </div>
                {pair.caption && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <HiOutlineDocumentText className="size-3.5 text-success/60 flex-shrink-0" />
                    <span
                      className="text-xs text-foreground/50 truncate"
                      title={pair.caption}
                    >
                      {pair.caption}
                    </span>
                  </div>
                )}
              </div>

              {/* Status badge */}
              <Badge variant={pair.caption ? 'success' : 'ghost'}>
                {pair.caption ? 'Paired' : 'No caption'}
              </Badge>

              {/* Remove button */}
              <Button
                variant={ButtonVariant.GHOST}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1"
                onClick={() => onRemoveFile(index)}
              >
                <HiOutlineTrash className="size-4 text-foreground/40 hover:text-error" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
