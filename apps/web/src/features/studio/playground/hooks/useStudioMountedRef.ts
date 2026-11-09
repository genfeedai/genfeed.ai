'use client';

import { useEffect, useRef } from 'react';

/**
 * `true` between mount and a real unmount. It survives React Strict Mode's
 * dev-only mount -> cleanup -> mount cycle, so async work can check it before
 * touching state after the workspace has really gone.
 */
export function useStudioMountedRef() {
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  return isMountedRef;
}
