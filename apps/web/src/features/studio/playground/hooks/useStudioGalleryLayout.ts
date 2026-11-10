'use client';

import { useRef, useState } from 'react';
import { useElementHeight } from '@/features/studio/playground/hooks/useElementHeight';

/**
 * The refs and focus state that tie the gallery scroller to the composer dock
 * and to the focused-preview overlay.
 */
export function useStudioGalleryLayout() {
  const [focusedScope, setFocusedScope] = useState<string | null>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLDivElement>(null);
  // The composer overlays the gallery, so the last card needs scroll room for
  // however tall the composer currently is (it grows with attachments, notices
  // and context rows).
  const composerHeight = useElementHeight(composerDockRef);
  const galleryPositionRef = useRef(0);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  return {
    composerDockRef,
    composerHeight,
    focusReturnRef,
    focusedScope,
    galleryPositionRef,
    galleryScrollRef,
    setFocusedScope,
  };
}
