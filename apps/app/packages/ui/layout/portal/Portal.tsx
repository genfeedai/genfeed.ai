'use client';

import type { PortalProps } from '@props/ui/content/portal.props';
import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

export default function Portal({ children, container }: PortalProps) {
  // Use useSyncExternalStore to safely check if we're on the client
  const mounted = useSyncExternalStore(
    () => () => {}, // subscribe - no-op since we don't need updates
    () => true, // client snapshot - always true
    () => false, // server snapshot - always false
  );

  if (!mounted) {
    return null;
  }

  return createPortal(children, container || document.body);
}
