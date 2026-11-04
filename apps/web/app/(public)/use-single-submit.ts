import { useCallback, useRef, useState } from 'react';

/** Returned by a submit action that navigates away on success. */
export const SUBMIT_REDIRECTING = 'redirecting' as const;

/**
 * Guards an async form submit so it runs once at a time.
 *
 * - A second submit (double click, Enter held down) is ignored synchronously,
 *   before React has re-rendered the disabled button.
 * - When the action returns `SUBMIT_REDIRECTING`, `isSubmitting` stays `true`
 *   so the button does not re-enable during the page navigation that follows.
 */
export function useSingleSubmit() {
  const isInFlightRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const runSubmit = useCallback(
    async (action: () => Promise<unknown>): Promise<void> => {
      if (isInFlightRef.current) {
        return;
      }

      isInFlightRef.current = true;
      setIsSubmitting(true);
      let isRedirecting = false;

      try {
        isRedirecting = (await action()) === SUBMIT_REDIRECTING;
      } finally {
        if (!isRedirecting) {
          isInFlightRef.current = false;
          setIsSubmitting(false);
        }
      }
    },
    [],
  );

  return { isSubmitting, runSubmit };
}
