'use client';

import { authClient } from './client';

/**
 * Permanent keepalive subscriber for the Better Auth session store.
 *
 * ## Why this exists
 *
 * Better Auth's React client is provider-less: `authClient.useSession()` reads
 * from a single nanostores atom created once at module load (see `client.ts`).
 * Nanostores atoms are lazy — the atom's `onMount` initializer, which fires the
 * `GET /v1/auth/get-session` request, runs only on the inactive→active
 * transition (listener count 0→1). When the last listener unsubscribes,
 * nanostores does NOT tear down immediately; it schedules teardown after
 * `STORE_UNMOUNT_DELAY` (1000ms). Only if the atom is still at 0 listeners once
 * that timer elapses does it deactivate.
 *
 * In development, cold-compiling Suspense/lazy boundaries thrash mount/unmount:
 * every time all `useSession()` consumers drain to 0 listeners for >1s and a new
 * consumer then mounts, the atom re-activates and re-fires `get-session`. A
 * single `/[org]/[brand]/overview` load was observed firing ~34 identical
 * `get-session` requests this way — pure duplicate fetching, every response 200.
 *
 * ## What this fixes
 *
 * Mounting ONE component that subscribes to the session and never unmounts pins
 * the atom's listener count at ≥1 for the lifetime of the protected app shell.
 * The atom activates exactly once, `onMount` fires exactly one `get-session`,
 * and every later consumer that mounts attaches to the already-active atom with
 * NO additional network request. The 34-request storm collapses to 1.
 *
 * ## Mount contract (important)
 *
 * This MUST be mounted ABOVE every Suspense boundary in the protected tree — it
 * lives in `protected-layout-client.tsx` as a sibling of `<AppProtectedLayout>`,
 * whose own contents are Suspense-wrapped. Kept above Suspense, it stays mounted
 * while lazy children suspend and resolve. If it were placed inside a Suspense
 * boundary it could itself unmount during a fallback, releasing the last listener
 * and defeating the keepalive.
 *
 * Renders nothing.
 */
export function SessionKeepAlive(): null {
  // Subscribe to the session store. The return value is intentionally unused:
  // the ONLY purpose of this hook call is to hold a permanent listener on the
  // nanostores atom so it never deactivates while the protected shell is
  // mounted. Do not read the session here — consumers resolve it through their
  // own `useSession()` calls, which now share this single kept-alive fetch.
  authClient.useSession();

  return null;
}
