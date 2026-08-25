'use client';

import { logger } from '@services/core/logger.service';
import { useEffect } from 'react';

// Served by app/serwist/[path]/route.ts, which sets Service-Worker-Allowed: /
// so the worker can claim the root scope from this nested URL.
export const SERVICE_WORKER_URL = '/serwist/sw.js';

// Registering in dev buys nothing — the dev worker is NetworkOnly for every
// request — and costs an extra esbuild pass over app/sw.ts on each dev boot.
const IS_ENABLED = process.env.NODE_ENV === 'production';

export function isIgnorableServiceWorkerError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  return (
    (error instanceof Error && error.name === 'AbortError') ||
    /Failed to register a ServiceWorker/i.test(message) ||
    /serwist\/sw\.js/i.test(message) ||
    /403/.test(message)
  );
}

/**
 * Registers the studio service worker. Renders nothing.
 *
 * SerwistProvider's register() has no onError; HeadlessChrome abort and a
 * 403 on /serwist/sw.js became unhandled rejections (APP-GENFEED-AI-H/F).
 * Update prompts stay with `DeploymentVersionWatcher`.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (
      !IS_ENABLED ||
      typeof navigator === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      return;
    }

    void navigator.serviceWorker
      .register(SERVICE_WORKER_URL, { scope: '/' }) // classic script, not `{ type: 'module' }`
      .catch((error: unknown) => {
        if (isIgnorableServiceWorkerError(error)) {
          return;
        }
        logger.error('Service worker registration failed', {
          error,
          reportToSentry: false,
        });
      });
  }, []);

  return null;
}
