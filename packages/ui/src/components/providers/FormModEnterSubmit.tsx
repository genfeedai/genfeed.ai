'use client';

import { useEffect } from 'react';
import { handleFormModEnterSubmit } from './form-mod-enter-submit';

/**
 * App-wide ⌘/Ctrl+Enter → submit the nearest form.
 *
 * Mounted once from AppProviders so every product form (auth, settings,
 * modals, etc.) gets the same shortcut. Opt out with
 * `data-mod-enter-submit="false"` on a form.
 */
export default function FormModEnterSubmit() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      handleFormModEnterSubmit(event);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return null;
}
