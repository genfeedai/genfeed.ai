'use client';

import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundJob } from '@genfeedai/contracts/interfaces/studio/studio-playground.interface';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback } from 'react';

export interface UseStudioPreviewNavigationParams {
  focusReturnRef: MutableRefObject<HTMLElement | null>;
  focusedScopeKey: string;
  galleryPositionRef: MutableRefObject<number>;
  galleryScrollRef: MutableRefObject<HTMLDivElement | null>;
  handleAttachGeneratedReference: (
    ingredient: IIngredient,
    targetType: 'image' | 'video',
  ) => void;
  revealInspector: (() => void) | undefined;
  selectedJobId: string | null;
  setFocusedScope: Dispatch<SetStateAction<string | null>>;
  setSelectedJobId: (id: string | null) => void;
}

/**
 * Selecting a card, opening and closing the inspector and the focused
 * preview (with scroll and focus restored), and remixing a result.
 */
export function useStudioPreviewNavigation({
  focusReturnRef,
  focusedScopeKey,
  galleryPositionRef,
  galleryScrollRef,
  handleAttachGeneratedReference,
  revealInspector,
  selectedJobId,
  setFocusedScope,
  setSelectedJobId,
}: UseStudioPreviewNavigationParams) {
  const handleSelectJob = useCallback(
    (job: StudioPlaygroundJob) => {
      setSelectedJobId(job.id);
      // Selecting a different card opens its inspector through the selection
      // effect; re-clicking the selected card must reveal a collapsed panel.
      if (job.id === selectedJobId) revealInspector?.();
    },
    [revealInspector, selectedJobId, setSelectedJobId],
  );
  const handleCloseInspector = useCallback(() => {
    setSelectedJobId(null);
    setFocusedScope(null);
  }, [setSelectedJobId, setFocusedScope]);
  const handleOpenFocusedPreview = useCallback(() => {
    focusReturnRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    galleryPositionRef.current = galleryScrollRef.current?.scrollTop ?? 0;
    setFocusedScope(focusedScopeKey);
    galleryScrollRef.current?.scrollTo({ top: 0 });
  }, [
    focusedScopeKey,
    setFocusedScope,
    galleryScrollRef.current?.scrollTop,
    galleryPositionRef,
    focusReturnRef,
    galleryScrollRef.current?.scrollTo,
  ]);
  const handleCloseFocusedPreview = useCallback(() => {
    setFocusedScope(null);
    requestAnimationFrame(() => {
      galleryScrollRef.current?.scrollTo({ top: galleryPositionRef.current });
      const returnTarget = focusReturnRef.current?.isConnected
        ? focusReturnRef.current
        : (document.querySelector<HTMLElement>(
            '[data-testid="studio-open-focused-preview"]',
          ) ?? galleryScrollRef.current);
      returnTarget?.focus({ preventScroll: true });
    });
  }, [
    setFocusedScope,
    galleryScrollRef.current,
    focusReturnRef.current?.isConnected,
    galleryPositionRef.current,
    focusReturnRef.current,
  ]);
  // Remix feeds a finished image back into the composer as an image
  // reference. Videos are not offered: a video reference is dropped again by
  // any model without video-reference support, including Auto.
  const handleRemixJob = useCallback(
    (job: StudioPlaygroundJob) => {
      if (job.ingredient && job.type === 'image') {
        handleAttachGeneratedReference(job.ingredient, 'image');
      }
    },
    [handleAttachGeneratedReference],
  );
  return {
    handleCloseFocusedPreview,
    handleCloseInspector,
    handleOpenFocusedPreview,
    handleRemixJob,
    handleSelectJob,
  };
}
