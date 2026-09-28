'use client';

import { getGenfeedDesktopBridge } from '@genfeedai/agent/utils/desktop-bridge.util';
import type { IDesktopLocalToolReadiness } from '@genfeedai/contracts/desktop';
import { useEffect, useState } from 'react';

let cachedDetection: Promise<IDesktopLocalToolReadiness | null> | null = null;

/**
 * Detection spawns `--version` for each CLI in Electron main, so it runs once
 * per renderer session and is shared by every consumer. Resolves to null
 * outside Genfeed Desktop or when detection fails.
 */
function loadDesktopLocalTools(): Promise<IDesktopLocalToolReadiness | null> {
  const bridge = getGenfeedDesktopBridge();
  if (!bridge) {
    return Promise.resolve(null);
  }

  cachedDetection ??= bridge.app.detectLocalTools().catch(() => {
    cachedDetection = null;
    return null;
  });
  return cachedDetection;
}

/** Test hook: forget the cached detection. */
export function resetDesktopLocalToolsCache(): void {
  cachedDetection = null;
}

export interface DesktopLocalToolsState {
  /** False while Genfeed Desktop is still detecting the local CLIs. */
  isResolved: boolean;
  /** Local CLIs on this desktop; null outside Desktop or if detection failed. */
  tools: IDesktopLocalToolReadiness | null;
}

/** Local CLIs installed on this desktop, and whether detection has finished. */
export function useDesktopLocalTools(): DesktopLocalToolsState {
  const [state, setState] = useState<DesktopLocalToolsState>(() => ({
    // Browsers have nothing to detect.
    isResolved: getGenfeedDesktopBridge() === null,
    tools: null,
  }));

  useEffect(() => {
    if (!getGenfeedDesktopBridge()) {
      return;
    }

    const controller = new AbortController();

    void loadDesktopLocalTools().then((tools) => {
      if (!controller.signal.aborted) {
        setState({ isResolved: true, tools });
      }
    });

    return () => controller.abort();
  }, []);

  return state;
}
