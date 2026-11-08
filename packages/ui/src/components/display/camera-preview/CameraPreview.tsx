'use client';

import { cn } from '@genfeedai/helpers/formatting/cn';
import type { CameraPreviewProps } from '@genfeedai/props/studio/camera-preview.props';
import { useEffect, useRef } from 'react';

/**
 * Shows a live camera stream. A media element is the only way to render a
 * `MediaStream`, so this is the one place the app draws a raw video for it.
 * Muted so the person never hears themselves while recording.
 */
export default function CameraPreview({
  className,
  isMirrored = true,
  label,
  stream,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    element.srcObject = stream;
    return () => {
      element.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      aria-label={label}
      autoPlay
      className={cn(
        'size-full bg-black object-cover' /* design-system-allow-content-color -- camera surface */,
        isMirrored && '-scale-x-100',
        className,
      )}
      muted
      playsInline
      ref={videoRef}
    />
  );
}
