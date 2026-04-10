'use client';

import type { IngredientDropZoneProps } from '@genfeedai/props/ui/content/ingredient-drop-zone.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { readIngredientTransferData } from '@ui/drag-drop/shared/ingredient-transfer';
import type { DragEvent } from 'react';
import { useState } from 'react';

export default function DropZoneIngredient({
  ingredient,
  onDrop,
  children,
  isEnabled = true,
}: IngredientDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!isEnabled) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const draggedId = e.dataTransfer.getData('ingredientId');
    if (draggedId && draggedId !== ingredient.id) {
      e.dataTransfer.dropEffect = 'move';
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!isEnabled) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    if (!isEnabled) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    try {
      const droppedIngredient = readIngredientTransferData(e.dataTransfer);
      const draggedId = droppedIngredient?.id;

      // Prevent dropping on itself
      if (draggedId === ingredient.id) {
        return;
      }

      if (droppedIngredient) {
        onDrop(droppedIngredient, ingredient);
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
      className={`relative ${isDragOver && isEnabled ? 'ring-4 ring-primary ring-offset-2' : ''}`}
    >
      {children}
      {isDragOver && isEnabled && (
        <div className="absolute inset-0 bg-primary/30 pointer-events-none z-50 flex items-center justify-center">
          <div className="bg-primary text-white px-3 py-1 rounded-full text-sm font-medium">
            Set as parent
          </div>
        </div>
      )}
    </div>
  );
}
