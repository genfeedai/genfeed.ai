import { useEffect, useState } from 'react';

interface UseAnimatedTextOptions {
  animate?: boolean;
  charsPerTick?: number;
  intervalMs?: number;
}

export function useAnimatedText(
  text: string,
  options: UseAnimatedTextOptions = {},
): {
  displayedText: string;
  isAnimating: boolean;
} {
  const { animate = true, charsPerTick = 6, intervalMs = 12 } = options;
  const [visibleChars, setVisibleChars] = useState(animate ? 0 : text.length);
  const [trackedText, setTrackedText] = useState(text);

  // Adjust during render when the source string changes — no ref, no effect flash.
  if (text !== trackedText) {
    setTrackedText(text);
    if (!animate) {
      setVisibleChars(text.length);
    } else if (!text.startsWith(trackedText)) {
      setVisibleChars(0);
    } else if (visibleChars > text.length) {
      setVisibleChars(text.length);
    }
  } else if (!animate && visibleChars !== text.length) {
    setVisibleChars(text.length);
  }

  useEffect(() => {
    if (!animate || visibleChars >= text.length) {
      return;
    }

    const timer = window.setInterval(() => {
      setVisibleChars((current) =>
        current >= text.length
          ? current
          : Math.min(text.length, current + charsPerTick),
      );
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [animate, charsPerTick, intervalMs, text.length, visibleChars]);

  return {
    displayedText: animate ? text.slice(0, visibleChars) : text,
    isAnimating: animate && visibleChars < text.length,
  };
}
