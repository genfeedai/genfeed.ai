'use client';

import { type RefObject, useEffect, useRef } from 'react';

/**
 * `current` is `true` between mount and a real unmount. It survives React
 * Strict Mode's dev-only mount, cleanup, mount cycle, so async work can check
 * it before touching state after the component has really gone.
 */
export function useMountedRef(): RefObject<boolean> {
  const mountedRef = useRef(false);

  // use-effect-audit: ignore tracks mount state for async callbacks that outlive the render
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return mountedRef;
}
