'use client';

import { SerwistProvider } from '@serwist/turbopack/react';

// Served by app/serwist/[path]/route.ts, which sets Service-Worker-Allowed: /
// so the worker can claim the root scope from this nested URL.
const SERVICE_WORKER_URL = '/serwist/sw.js';

// Registering in dev buys nothing — the dev worker is NetworkOnly for every
// request — and costs an extra esbuild pass over app/sw.ts on each dev boot.
const IS_ENABLED = process.env.NODE_ENV === 'production';

/**
 * Registers the studio service worker. Renders nothing.
 *
 * Both Serwist defaults that would take control of the page are turned off:
 * `cacheOnNavigation` would push every visited pathname into the precache
 * (tenant-scoped documents included), and `reloadOnOnline` force-reloads the
 * tab when connectivity returns, which would discard an in-progress edit in the
 * studio. Update prompts stay with `DeploymentVersionWatcher`.
 */
export default function ServiceWorkerRegistrar() {
  return (
    <SerwistProvider
      cacheOnNavigation={false}
      disable={!IS_ENABLED}
      reloadOnOnline={false}
      swUrl={SERVICE_WORKER_URL}
    />
  );
}
