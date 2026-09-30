'use client';

import { desktopRuntimeService } from '@genfeedai/services/core/desktop-runtime.service';
import { useSyncExternalStore } from 'react';

export function useDesktopRuntimeContext() {
  return useSyncExternalStore(
    desktopRuntimeService.subscribe,
    desktopRuntimeService.getSnapshot,
    desktopRuntimeService.getServerSnapshot,
  );
}
