'use client';

import { isDesktopClient } from '@genfeedai/config/deployment';

import { logger } from '@services/core/logger.service';
import { useEffect } from 'react';

const SERVICE_WORKER_REGISTRATION_ERROR_PATTERN =
  /Failed to register a ServiceWorker/i;
const SERWIST_SCRIPT_PATTERN = /serwist\/sw\.js/i;
const FORBIDDEN_STATUS_PATTERN = /403/;

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
    SERVICE_WORKER_REGISTRATION_ERROR_PATTERN.test(message) ||
    SERWIST_SCRIPT_PATTERN.test(message) ||
    FORBIDDEN_STATUS_PATTERN.test(message)
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
      isDesktopClient() ||
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
