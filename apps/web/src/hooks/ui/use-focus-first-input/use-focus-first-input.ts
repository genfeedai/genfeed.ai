import { useEffect, useRef } from 'react';

export function useFocusFirstInput<T extends HTMLFormElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const form = ref.current;
    if (form) {
      const first = form.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not(:disabled), textarea:not(:disabled), select:not(:disabled)',
      );

      first?.focus();
    }
  }, []);

  return ref;
}
