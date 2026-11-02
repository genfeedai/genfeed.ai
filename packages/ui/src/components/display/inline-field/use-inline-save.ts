'use client';

import { useState } from 'react';

/** Runs a save and keeps the control disabled until it settles. */
export function useInlineSave() {
  const [isSaving, setIsSaving] = useState(false);

  const save = async (run: () => Promise<void> | void) => {
    setIsSaving(true);
    try {
      await run();
    } finally {
      setIsSaving(false);
    }
  };

  return { isSaving, save };
}
