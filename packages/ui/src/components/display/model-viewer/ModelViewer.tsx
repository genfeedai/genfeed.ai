'use client';

import { cn } from '@genfeedai/helpers/formatting/cn';
import type { ModelViewerProps } from '@genfeedai/props/studio/model-viewer.props';
import { logger } from '@genfeedai/services/core/logger.service';
import { useEffect, useRef, useState } from 'react';

const MODEL_VIEWER_TAG = 'model-viewer';

/**
 * Orbitable preview of one GLB, with an AR button on devices that support it
 * (iOS Quick Look builds its USDZ from the GLB at runtime). The
 * `<model-viewer>` web component is loaded on first render in the browser, so
 * the three.js bundle never reaches the server render or pages without a 3D
 * asset. The element is built imperatively because it is not a React element.
 */
export default function ModelViewer({
  alt,
  className,
  errorLabel,
  poster,
  src,
}: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    let isCancelled = false;
    let viewer: HTMLElement | null = null;
    setHasError(false);

    const handleError = () => {
      if (!isCancelled) {
        setHasError(true);
      }
    };

    const mount = async () => {
      try {
        await import('@google/model-viewer');
      } catch (error: unknown) {
        logger.error('Failed to load the 3D viewer', error);
        handleError();
        return;
      }
      if (isCancelled) {
        return;
      }

      viewer = document.createElement(MODEL_VIEWER_TAG);
      viewer.setAttribute('src', src);
      viewer.setAttribute('alt', alt);
      viewer.setAttribute('camera-controls', '');
      viewer.setAttribute('auto-rotate', '');
      viewer.setAttribute('ar', '');
      viewer.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
      viewer.setAttribute('shadow-intensity', '1');
      viewer.setAttribute('touch-action', 'pan-y');
      if (poster) {
        viewer.setAttribute('poster', poster);
      }
      viewer.className = 'size-full';
      viewer.addEventListener('error', handleError);
      container.appendChild(viewer);
    };

    void mount();

    return () => {
      isCancelled = true;
      viewer?.removeEventListener('error', handleError);
      viewer?.remove();
    };
  }, [alt, poster, src]);

  return (
    <div className={cn('relative size-full', className)}>
      <div ref={containerRef} className="size-full" />
      {hasError ? (
        <div
          className="absolute inset-0 flex items-center justify-center bg-foreground/5 p-4 text-center text-xs text-muted-foreground"
          role="alert"
        >
          {errorLabel}
        </div>
      ) : null}
    </div>
  );
}
