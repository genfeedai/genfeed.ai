'use client';

import Image from 'next/image';
import { memo, useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface ComparisonSliderProps {
  beforeSrc: string;
  afterSrc: string;
  beforeLabel?: string;
  afterLabel?: string;
  position: number;
  onPositionChange: (position: number) => void;
  height?: number;
  className?: string;
}

function ComparisonSliderComponent({
  beforeSrc,
  afterSrc,
  beforeLabel = 'Before',
  afterLabel = 'After',
  position,
  onPositionChange,
  height = 128,
  className,
}: ComparisonSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const newPosition = Math.max(0, Math.min(100, (x / rect.width) * 100));
      onPositionChange(newPosition);
    },
    [onPositionChange],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      handleMove(e.clientX);
    },
    [handleMove],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      handleMove(e.clientX);
    },
    [isDragging, handleMove],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      setIsDragging(true);
      handleMove(e.touches[0].clientX);
    },
    [handleMove],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      handleMove(e.touches[0].clientX);
    },
    [isDragging, handleMove],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPositionChange(Math.max(0, position - 5));
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        onPositionChange(Math.min(100, position + 5));
      }
    },
    [onPositionChange, position],
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden rounded-md cursor-ew-resize select-none',
        className,
      )}
      style={{ height }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
      onKeyDown={handleKeyDown}
      role="slider"
      tabIndex={0}
      aria-label="Compare images"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
    >
      {/* After image (full width background) */}
      <Image
        unoptimized
        src={afterSrc}
        alt={afterLabel}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        draggable={false}
        width={800}
        height={600}
      />

      {/* Before image (clipped) */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ width: `${position}%` }}
      >
        <Image
          unoptimized
          src={beforeSrc}
          alt={beforeLabel}
          className="absolute inset-0 h-full object-cover"
          style={{ width: containerRef.current?.offsetWidth ?? '100%' }}
          draggable={false}
          width={800}
          height={600}
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        {/* Handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-6 bg-white rounded-full shadow-lg flex items-center justify-center">
          <svg viewBox="0 0 24 24" className="size-3 text-muted-foreground">
            <path fill="currentColor" d="M8 5v14l-7-7 7-7m8 0v14l7-7-7-7" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-1.5 left-1.5 px-1 py-0.5 bg-black/60 rounded text-[9px] text-white font-medium pointer-events-none">
        {beforeLabel}
      </div>
      <div className="absolute top-1.5 right-1.5 px-1 py-0.5 bg-black/60 rounded text-[9px] text-white font-medium pointer-events-none">
        {afterLabel}
      </div>
    </div>
  );
}

export const ComparisonSlider = memo(ComparisonSliderComponent);
