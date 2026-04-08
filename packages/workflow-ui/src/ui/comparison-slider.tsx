'use client';

import { ChevronsLeftRight } from 'lucide-react';
import Image from 'next/image';
import { memo, useCallback, useRef, useState } from 'react';
import { cn } from './utils';

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
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 10 : 1;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onPositionChange(Math.max(0, position - step));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onPositionChange(Math.min(100, position + step));
      } else if (e.key === 'Home') {
        e.preventDefault();
        onPositionChange(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        onPositionChange(100);
      }
    },
    [onPositionChange, position],
  );

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Image comparison slider"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      className={cn(
        'relative overflow-hidden cursor-ew-resize select-none',
        className,
      )}
      style={{ height }}
      onKeyDown={handleKeyDown}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
    >
      <Image
        src={afterSrc}
        alt={afterLabel}
        fill
        unoptimized
        sizes="(max-width: 768px) 100vw, 300px"
        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
      />

      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ width: `${position}%` }}
      >
        <Image
          src={beforeSrc}
          alt={beforeLabel}
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 300px"
          className="absolute inset-0 h-full object-cover"
        />
      </div>

      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
      >
        <div className="absolute top-1/2 left-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-lg">
          <ChevronsLeftRight className="h-3 w-3 text-gray-600" aria-hidden />
        </div>
      </div>

      <div className="absolute top-1.5 left-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white pointer-events-none">
        {beforeLabel}
      </div>
      <div className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1 py-0.5 text-[9px] font-medium text-white pointer-events-none">
        {afterLabel}
      </div>
    </div>
  );
}

export const ComparisonSlider = memo(ComparisonSliderComponent);
