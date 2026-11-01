'use client';

import { Toaster as SonnerToaster, type ToasterProps, toast } from 'sonner';

/**
 * The app's one toast host. Mount it once per app shell; everything else shows
 * a toast with the re-exported `toast` (or `NotificationsService`), never a
 * hand-built fixed stack.
 */
function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster closeButton position="top-right" richColors {...props} />
  );
}

export type { ToasterProps };
export { Toaster, toast };
