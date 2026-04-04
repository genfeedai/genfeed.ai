import { usePathname } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';

export function useFormSubmitWithState(handler: () => void | Promise<void>) {
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  const isNavigatingRef = useRef(false);
  const isSubmittingRef = useRef(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const setSubmittingState = (nextValue: boolean) => {
    isSubmittingRef.current = nextValue;
    setIsSubmitting(nextValue);
  };

  useEffect(() => {
    const hasPathChanged = pathname !== prevPathRef.current;
    prevPathRef.current = pathname;

    if (!hasPathChanged || !isSubmittingRef.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      setSubmittingState(false);
      isNavigatingRef.current = false;
    });

    return () => cancelAnimationFrame(frame);
  }, [pathname, setSubmittingState]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmittingState(true);

    prevPathRef.current = pathname;
    isNavigatingRef.current = false;

    try {
      await handler();
      if (prevPathRef.current === pathname && !isNavigatingRef.current) {
        setSubmittingState(false);
      }
    } catch {
      if (prevPathRef.current === pathname && !isNavigatingRef.current) {
        setSubmittingState(false);
      }
    }
  };

  return {
    isSubmitting,
    onSubmit,
    setNavigating: (value: boolean) => {
      isNavigatingRef.current = value;
    },
  };
}
