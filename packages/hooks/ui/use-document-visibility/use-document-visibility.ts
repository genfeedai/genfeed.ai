import { useEffect, useState } from 'react';

/**
 * Hook that tracks the document visibility state.
 * Returns `true` when the document is visible, `false` when hidden.
 * Useful for pausing polling or animations when the tab is not active.
 */
export function useDocumentVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(() =>
    typeof document === 'undefined' ? true : !document.hidden,
  );

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible;
}
