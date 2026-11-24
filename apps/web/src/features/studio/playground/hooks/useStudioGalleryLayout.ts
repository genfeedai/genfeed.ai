'use client';

import { useRef, useState } from 'react';

/**
 * The refs and focus state that tie the gallery scroller to the focused-preview
 * overlay.
 */
export function useStudioGalleryLayout() {
  const [focusedScope, setFocusedScope] = useState<string | null>(null);
  const galleryScrollRef = useRef<HTMLDivElement>(null);
  const galleryPositionRef = useRef(0);
  const focusReturnRef = useRef<HTMLElement | null>(null);
  return {
    focusReturnRef,
    focusedScope,
    galleryPositionRef,
    galleryScrollRef,
    setFocusedScope,
  };
}
