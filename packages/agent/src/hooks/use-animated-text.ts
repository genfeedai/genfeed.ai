import { useEffect, useRef, useState } from 'react';

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
  const previousTextRef = useRef(text);
  const [visibleChars, setVisibleChars] = useState(animate ? 0 : text.length);

  useEffect(() => {
    if (!animate) {
      previousTextRef.current = text;
      setVisibleChars(text.length);
      return;
    }

    const previousText = previousTextRef.current;
    previousTextRef.current = text;

    if (text === previousText) {
      return;
    }

    setVisibleChars((current) => {
      if (!text.startsWith(previousText)) {
        return 0;
      }

      return Math.min(current, text.length);
    });
  }, [animate, text]);

  useEffect(() => {
    if (!animate) {
      return;
    }

    if (visibleChars >= text.length) {
      return;
    }

    const timer = window.setInterval(() => {
      setVisibleChars((current) => {
        if (current >= text.length) {
          window.clearInterval(timer);
          return current;
        }

        return Math.min(text.length, current + charsPerTick);
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [animate, charsPerTick, intervalMs, text.length, visibleChars]);

  return {
    displayedText: animate ? text.slice(0, visibleChars) : text,
    isAnimating: animate && visibleChars < text.length,
  };
}
