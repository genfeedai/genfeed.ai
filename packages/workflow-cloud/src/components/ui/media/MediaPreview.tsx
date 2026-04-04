'use client';

import { cn } from '@helpers/formatting/cn/cn.util';

interface MediaPreviewProps {
  src: string;
  type: 'image' | 'video' | 'text' | null;
  className?: string;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
}

/**
 * Standardized media preview component for workflow nodes
 * Handles video, image, and text preview with consistent styling
 */
export function MediaPreview({
  src,
  type,
  className,
  controls = false,
  autoPlay = true,
  muted = true,
  loop = true,
}: MediaPreviewProps): React.JSX.Element {
  const containerClass = cn(' overflow-hidden bg-black/20', className);

  if (type === 'video') {
    return (
      <div className={containerClass}>
        <video
          src={src}
          className="h-24 w-full object-contain"
          controls={controls}
          autoPlay={autoPlay}
          muted={muted}
          loop={loop}
          playsInline
        />
      </div>
    );
  }

  if (type === 'image') {
    return (
      <div className={containerClass}>
        <img src={src} alt="Preview" className="h-24 w-full object-contain" />
      </div>
    );
  }

  // Text fallback
  return (
    <div className={cn(containerClass, 'p-2 max-h-24 overflow-y-auto text-xs')}>
      {src}
    </div>
  );
}
