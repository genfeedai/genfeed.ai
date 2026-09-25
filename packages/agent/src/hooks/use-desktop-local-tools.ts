'use client';

import { getGenfeedDesktopBridge } from '@genfeedai/agent/utils/desktop-bridge.util';
import type { IDesktopLocalToolReadiness } from '@genfeedai/contracts/desktop';
import { useEffect, useState } from 'react';

let cachedDetection: Promise<IDesktopLocalToolReadiness | null> | null = null;

/**
 * Detection spawns `--version` for each CLI in Electron main, so it runs once
 * per renderer session and is shared by every consumer.
 */
function detectDesktopLocalTools(): Promise<IDesktopLocalToolReadiness | null> {
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

/** Local CLIs installed on this desktop, or null outside Genfeed Desktop. */
export function useDesktopLocalTools(): IDesktopLocalToolReadiness | null {
  const [tools, setTools] = useState<IDesktopLocalToolReadiness | null>(null);

  useEffect(() => {
    // Browsers have nothing to detect; skip the async round-trip entirely.
    if (!getGenfeedDesktopBridge()) {
      return;
    }

    const controller = new AbortController();

    void detectDesktopLocalTools().then((readiness) => {
      if (!controller.signal.aborted) {
        setTools(readiness);
      }
    });

    return () => controller.abort();
  }, []);

  return tools;
}
