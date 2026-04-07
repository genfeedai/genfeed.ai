'use client';

import type { IIngredient } from '@genfeedai/interfaces';
import type { FolderDropZoneProps } from '@props/content/folder-drop-zone.props';
import { logger } from '@services/core/logger.service';
import { readIngredientTransferData } from '@ui/drag-drop/shared/ingredient-transfer';
import type { DragEvent } from 'react';
import { useState } from 'react';
import { HiFolder, HiFolderOpen } from 'react-icons/hi2';

export default function DropZoneFolder({
  folder,
  onDrop,
  className = '',
  children,
  onClick,
  isSelected = false,
}: FolderDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Only set isDragOver to false if we're leaving the drop zone entirely
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const ingredient = readIngredientTransferData(e.dataTransfer);

      if (ingredient) {
        onDrop(ingredient as IIngredient, folder);
      }
    } catch (error) {
      logger.error('Failed to parse dropped ingredient data:', error);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onClick}
      className={`
        rounded-lg border p-3 transition-colors duration-200 cursor-pointer
        hover:bg-white/[0.04]
        ${className}
        ${
          isDragOver || isSelected
            ? 'border-primary/50 bg-primary/[0.10]'
            : 'border-white/[0.08]'
        }

      `}
    >
      {children || (
        <div className="flex items-center gap-2">
          {isDragOver ? (
            <HiFolderOpen className="text-xl text-primary" />
          ) : (
            <HiFolder className="text-xl text-foreground/60" />
          )}

          <span className="font-medium">
            {folder ? folder.label : 'All Assets'}
          </span>
        </div>
      )}
    </div>
  );
}
