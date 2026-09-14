import type { DependencyList } from 'react';
import { useEffect, useRef, useState } from 'react';

export function useAbortController(dependencies: DependencyList = []) {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [currentController, setCurrentController] = useState<AbortController>(
    () => new AbortController(),
  );

  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const newController = new AbortController();
    abortControllerRef.current = newController;
    setCurrentController(newController);

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, dependencies);

  return currentController;
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message === 'AbortError')
  );
}
