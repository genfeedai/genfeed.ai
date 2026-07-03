'use client';

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

type VersionResponse = {
  buildId?: string;
};

// The build id this session was served with, inlined at build time via
// next.config `env`. Empty in local dev without the var — then there is nothing
// to compare and the watcher stays idle.
const CURRENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? '';
const VERSION_ENDPOINT = '/api/version';
const POLL_INTERVAL_MS = 60_000;

async function fetchServerBuildId(
  signal: AbortSignal,
): Promise<string | undefined> {
  try {
    const response = await fetch(VERSION_ENDPOINT, {
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      return undefined;
    }
    const data = (await response.json()) as VersionResponse;
    return typeof data.buildId === 'string' ? data.buildId : undefined;
  } catch {
    // Network blips / aborts are non-fatal — just try again next tick.
    return undefined;
  }
}

/**
 * Prompts the user to refresh when a newer deployment is live. Polls the
 * deployment's own build id (plus a check on tab refocus) and compares it to the
 * id this session loaded. On a mismatch it shows a persistent, dismissible toast
 * with a Refresh action — never a forced reload, so an in-progress edit in the
 * studio is never discarded. Renders nothing.
 */
export default function DeploymentVersionWatcher() {
  const hasPromptedRef = useRef(false);

  useEffect(() => {
    if (!CURRENT_BUILD_ID) {
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    async function checkForUpdate() {
      if (!isActive || hasPromptedRef.current || document.hidden) {
        return;
      }

      const serverBuildId = await fetchServerBuildId(controller.signal);
      if (
        !isActive ||
        !serverBuildId ||
        serverBuildId === CURRENT_BUILD_ID ||
        hasPromptedRef.current
      ) {
        return;
      }

      hasPromptedRef.current = true;
      toast('A new version is available', {
        action: {
          label: 'Refresh',
          onClick: () => window.location.reload(),
        },
        closeButton: true,
        description: 'Refresh to load the latest updates.',
        duration: Number.POSITIVE_INFINITY,
      });
    }

    const handleForeground = () => {
      void checkForUpdate();
    };

    const intervalId = window.setInterval(handleForeground, POLL_INTERVAL_MS);
    window.addEventListener('focus', handleForeground);
    document.addEventListener('visibilitychange', handleForeground);

    // Check once shortly after mount instead of waiting a full interval.
    void checkForUpdate();

    return () => {
      isActive = false;
      controller.abort();
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleForeground);
      document.removeEventListener('visibilitychange', handleForeground);
    };
  }, []);

  return null;
}
