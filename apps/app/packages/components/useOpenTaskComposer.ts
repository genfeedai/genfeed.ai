'use client';

import { useCallback } from 'react';
import { dispatchOpenTaskComposer } from '@/lib/workspace/task-composer-events';

/**
 * Opens the new-task note in place. The shell hosts the composer, so this
 * never leaves the page the user is on.
 */
export function useOpenTaskComposer(): () => void {
  return useCallback(() => {
    dispatchOpenTaskComposer();
  }, []);
}
