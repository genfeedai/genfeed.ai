'use client';

import type { DraggableIngredientProps } from '@props/ui/content/draggable-ingredient.props';
import { writeIngredientTransferData } from '@ui/drag-drop/shared/ingredient-transfer';
import type { DragEvent } from 'react';
import { useRef, useState } from 'react';

export default function DraggableIngredient({
  ingredient,
  children,
  onDragStart,
  onDragEnd,
  className = '',
}: DraggableIngredientProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);

  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = 'move';
    writeIngredientTransferData(e.dataTransfer, ingredient);

    onDragStart?.(ingredient);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd?.();
  };

  return (
    <div
      ref={dragRef}
      draggable
      onDragStartCapture={handleDragStart}
      onDragEnd={handleDragEnd}
      className={`${className} ${
        isDragging ? 'opacity-30' : ''
      } cursor-move transition-opacity duration-300`}
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
    >
      {children}
    </div>
  );
}
