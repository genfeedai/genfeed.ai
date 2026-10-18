import type {
  UsePromptBarRestingOptions,
  UsePromptBarRestingReturn,
} from '@genfeedai/props/prompt-bars/prompt-bar-resting.props';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createPromptBarRestingGesture,
  isScrollerAtEnd,
  recordPromptBarRestingScroll,
} from './prompt-bar-resting-gesture';

/**
 * t3code-style resting composer: scrolling the page folds the prompt bar into
 * one line, and reaching the end, focusing it or pressing it opens it again.
 */
export function usePromptBarResting({
  composerRef,
  isEnabled = true,
  scrollRef,
}: UsePromptBarRestingOptions): UsePromptBarRestingReturn {
  const [isResting, setIsResting] = useState(false);
  const isEnabledRef = useRef(isEnabled);

  useEffect(() => {
    isEnabledRef.current = isEnabled;
    if (!isEnabled) {
      setIsResting(false);
    }
  }, [isEnabled]);

  // The scroller can mount after the bar (a thread still loading), so the
  // listener follows whichever element the ref holds on each render.
  const scroller = scrollRef.current;

  useEffect(() => {
    if (!scroller) {
      return;
    }

    const gesture = createPromptBarRestingGesture(scroller.scrollTop);
    const handleScroll = () => {
      const isAtEnd = isScrollerAtEnd(scroller);
      if (isAtEnd) {
        setIsResting(false);
      }

      const shouldRest = recordPromptBarRestingScroll(gesture, {
        isAtEnd,
        now: performance.now(),
        scrollTop: scroller.scrollTop,
      });
      const composer = composerRef.current;
      const hasComposerFocus = Boolean(
        composer?.contains(document.activeElement),
      );

      if (shouldRest && isEnabledRef.current && !hasComposerFocus) {
        setIsResting(true);
      }
    };

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', handleScroll);
  }, [composerRef, scroller]);

  const expand = useCallback(() => setIsResting(false), []);

  return { expand, isResting: isEnabled && isResting };
}
