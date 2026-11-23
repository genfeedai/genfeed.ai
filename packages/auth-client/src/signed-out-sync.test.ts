import { afterEach, describe, expect, it } from 'vitest';

import {
  broadcastSignedOut,
  type SessionSnapshot,
  subscribeSignedOut,
  watchSignedOut,
} from './signed-out-sync';

const SIGNED_IN: SessionSnapshot = {
  data: { session: { id: 'session-1' }, user: { id: 'user-1' } },
  isPending: false,
};
const SIGNED_OUT: SessionSnapshot = { data: null, isPending: false };

function createSessionSource(): {
  emit: (snapshot: SessionSnapshot) => void;
  subscribe: (listener: (snapshot: SessionSnapshot) => void) => () => void;
} {
  const listeners = new Set<(snapshot: SessionSnapshot) => void>();

  return {
    emit: (snapshot) => {
      for (const listener of listeners) {
        listener(snapshot);
      }
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

describe('signed-out broadcast', () => {
  it('reaches a subscriber in another tab', async () => {
    const received = new Promise<void>((resolve) => {
      const unsubscribe = subscribeSignedOut(() => {
        unsubscribe();
        resolve();
      });
    });

    broadcastSignedOut();

    await expect(received).resolves.toBeUndefined();
  });

  it('stops delivering once the subscriber unsubscribes', async () => {
    let deliveries = 0;
    const unsubscribe = subscribeSignedOut(() => {
      deliveries += 1;
    });
    unsubscribe();

    const canary = new Promise<void>((resolve) => {
      const stopCanary = subscribeSignedOut(() => {
        stopCanary();
        resolve();
      });
    });
    broadcastSignedOut();
    await canary;

    expect(deliveries).toBe(0);
  });
});

describe('watchSignedOut', () => {
  const stops: Array<() => void> = [];

  afterEach(() => {
    for (const stop of stops.splice(0)) {
      stop();
    }
  });

  function watch(
    source: ReturnType<typeof createSessionSource>,
    onSignedOut: () => void = () => {},
  ): { readonly signedOutCount: number } {
    const counter = {
      signedOutCount: 0,
    };
    stops.push(
      watchSignedOut({
        onSignedOut: () => {
          counter.signedOutCount += 1;
          onSignedOut();
        },
        subscribeSession: source.subscribe,
      }),
    );
    return counter;
  }

  it('fires when a signed-in session turns signed out', () => {
    const source = createSessionSource();
    const watched = watch(source);

    source.emit(SIGNED_IN);
    source.emit(SIGNED_OUT);

    expect(watched.signedOutCount).toBe(1);
  });

  it('stays quiet for a visitor who was never signed in', () => {
    const source = createSessionSource();
    const watched = watch(source);

    source.emit({ data: null, isPending: true });
    source.emit(SIGNED_OUT);

    expect(watched.signedOutCount).toBe(0);
  });

  it('keeps a signed-in tab signed in while a session refetch is in flight', () => {
    const source = createSessionSource();
    const watched = watch(source);

    source.emit(SIGNED_IN);
    source.emit({ ...SIGNED_IN, isPending: false });

    expect(watched.signedOutCount).toBe(0);
  });

  it('fires only once when the session and the broadcast both report it', async () => {
    const source = createSessionSource();
    const watched = watch(source);
    source.emit(SIGNED_IN);

    source.emit(SIGNED_OUT);
    broadcastSignedOut();
    await vi.waitFor(() => expect(watched.signedOutCount).toBe(1));
    await new Promise((resolve) => setImmediate(resolve));

    expect(watched.signedOutCount).toBe(1);
  });

  it('fires when another tab broadcasts a sign-out', async () => {
    const source = createSessionSource();
    const fired = new Promise<void>((resolve) => {
      watch(source, resolve);
    });
    source.emit(SIGNED_IN);

    broadcastSignedOut();

    await expect(fired).resolves.toBeUndefined();
  });
});
