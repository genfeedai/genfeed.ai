'use client';

import { type RefObject, useEffect } from 'react';
import type { DragPanStart } from '@/props/ui/scroll-strip.props';

/** Set on the strip while a drag is panning it, for the grabbing cursor. */
export const DRAG_PANNING_ATTRIBUTE = 'data-panning';

/**
 * Lets a mouse drag on a horizontal strip's background pan it sideways.
 * Drags that start inside `ignoreSelector` (cards, links, buttons) are left
 * alone, so clicking and selecting there work as before. Touch and pen
 * already pan natively, so only the mouse is handled.
 */
export function useDragToPan(
  ref: RefObject<HTMLElement | null>,
  ignoreSelector: string,
): void {
  useEffect(() => {
    const strip = ref.current;
    if (!strip) {
      return;
    }

    let drag: DragPanStart | null = null;

    function handlePointerDown(event: PointerEvent) {
      if (!strip || event.pointerType !== 'mouse' || event.button !== 0) {
        return;
      }
      if (
        event.target instanceof Element &&
        event.target.closest(ignoreSelector)
      ) {
        return;
      }
      drag = {
        pointerId: event.pointerId,
        scrollLeft: strip.scrollLeft,
        x: event.clientX,
      };
      strip.setAttribute(DRAG_PANNING_ATTRIBUTE, '');
      strip.setPointerCapture?.(event.pointerId);
    }

    function handlePointerMove(event: PointerEvent) {
      if (!strip || !drag || event.pointerId !== drag.pointerId) {
        return;
      }
      event.preventDefault();
      strip.scrollLeft = drag.scrollLeft - (event.clientX - drag.x);
    }

    function endDrag(event: PointerEvent) {
      if (!strip || !drag || event.pointerId !== drag.pointerId) {
        return;
      }
      drag = null;
      strip.removeAttribute(DRAG_PANNING_ATTRIBUTE);
      strip.releasePointerCapture?.(event.pointerId);
    }

    strip.addEventListener('pointerdown', handlePointerDown);
    strip.addEventListener('pointermove', handlePointerMove);
    strip.addEventListener('pointerup', endDrag);
    strip.addEventListener('pointercancel', endDrag);
    return () => {
      strip.removeEventListener('pointerdown', handlePointerDown);
      strip.removeEventListener('pointermove', handlePointerMove);
      strip.removeEventListener('pointerup', endDrag);
      strip.removeEventListener('pointercancel', endDrag);
    };
  }, [ignoreSelector, ref]);
}
