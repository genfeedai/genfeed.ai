import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import { useEffect, useState } from 'react';

interface UseAnimatedCounterProps {
  end: number;
  duration?: number;
  suffix?: string;
  /** Number of decimal places to show (default: 0) */
  decimals?: number;
}

interface UseAnimatedCounterReturn {
  ref: React.RefObject<HTMLDivElement | null>;
  value: string;
}

/**
 * Hook for animated number counting with intersection observer.
 * Numbers count up from 0 to end value when element becomes visible.
 */
export function useAnimatedCounter({
  end,
  duration = 2000,
  suffix = '',
  decimals = 0,
}: UseAnimatedCounterProps): UseAnimatedCounterReturn {
  const [count, setCount] = useState(0);
  const { ref, isIntersecting } = useIntersectionObserver<HTMLDivElement>({
    threshold: 0.3,
    triggerOnce: true,
  });

  useEffect(() => {
    if (!isIntersecting) {
      return;
    }

    let rafId: number;
    const startTime = Date.now();
    const multiplier = 10 ** decimals;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - (1 - progress) ** 3;
      // Round to specified decimals
      setCount(Math.round(end * eased * multiplier) / multiplier);

      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      }
    };

    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isIntersecting, end, duration, decimals]);

  const formattedValue = decimals > 0 ? count.toFixed(decimals) : String(count);
  return { ref, value: `${formattedValue}${suffix}` };
}
