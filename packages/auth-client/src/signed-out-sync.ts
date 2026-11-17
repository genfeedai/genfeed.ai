/**
 * Cross-tab sign-out.
 *
 * Better Auth already announces a sign-out to other tabs through its own
 * `localStorage` message, but only while the session atom is mounted in the tab
 * that signs out. The `/logout` page sits outside the protected shell, so
 * nothing keeps that atom mounted there and the announcement is never sent. The
 * other tabs then keep their cached token and keep polling as if signed in.
 *
 * This module sends its own announcement, independent of the atom, and gives
 * every protected tab one place to notice that the visitor signed out, whether
 * the news came from another tab or from the session store itself.
 */

const SIGNED_OUT_CHANNEL = 'genfeed:auth:signed-out';

/** The slice of the Better Auth session store this module reads. */
export interface SessionSnapshot {
  data: { session?: unknown; user?: unknown } | null;
  isPending: boolean;
}

/** Tell every other tab of this browser that the visitor signed out. */
export function broadcastSignedOut(): void {
  if (typeof BroadcastChannel === 'undefined') {
    return;
  }

  const channel = new BroadcastChannel(SIGNED_OUT_CHANNEL);
  channel.postMessage('signed-out');
  channel.close();
}

/** Run `listener` when another tab signs out. Returns the unsubscribe. */
export function subscribeSignedOut(listener: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') {
    return () => {};
  }

  const channel = new BroadcastChannel(SIGNED_OUT_CHANNEL);
  channel.addEventListener('message', listener);

  return () => {
    channel.removeEventListener('message', listener);
    channel.close();
  };
}

interface WatchSignedOutOptions {
  onSignedOut: () => void;
  subscribeSession: (
    listener: (snapshot: SessionSnapshot) => void,
  ) => () => void;
}

/**
 * Calls `onSignedOut` once: when another tab broadcasts a sign-out, or when
 * this tab was signed in and the session store now reports no session.
 *
 * A failed refetch keeps the last known session in the store, so a network
 * blip never reads as a sign-out. A visitor who was never signed in here is
 * left to the route proxy.
 */
export function watchSignedOut({
  onSignedOut,
  subscribeSession,
}: WatchSignedOutOptions): () => void {
  let wasSignedIn = false;
  let hasFired = false;

  const fire = (): void => {
    if (hasFired) {
      return;
    }
    hasFired = true;
    onSignedOut();
  };

  const unsubscribeSession = subscribeSession(({ data, isPending }) => {
    if (data?.session) {
      wasSignedIn = true;
      return;
    }

    if (wasSignedIn && !isPending) {
      fire();
    }
  });
  const unsubscribeBroadcast = subscribeSignedOut(fire);

  return () => {
    unsubscribeSession();
    unsubscribeBroadcast();
  };
}
