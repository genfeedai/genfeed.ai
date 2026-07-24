import { beforeEach, describe, expect, it, vi } from 'vitest';

const useSessionMock = vi.hoisted(() => vi.fn());

vi.mock('./client', () => ({
  authClient: {
    useSession: useSessionMock,
  },
}));

import { SessionKeepAlive } from './session-keep-alive';

describe('SessionKeepAlive', () => {
  beforeEach(() => {
    useSessionMock.mockReset();
  });

  it('subscribes to the session store exactly once per render', () => {
    const result = SessionKeepAlive();

    // The keepalive's whole job is to hold a single listener on the
    // nanostores session atom so it never deactivates. One render must map
    // to exactly one subscription — no more, no less.
    expect(useSessionMock).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('never dereferences the session value it subscribes to', () => {
    // The atom can hand back an undefined/pending session; the keepalive must
    // only ever hold the subscription, never read from it, so an empty result
    // cannot throw.
    useSessionMock.mockReturnValue(undefined);

    expect(() => SessionKeepAlive()).not.toThrow();
    expect(SessionKeepAlive()).toBeNull();
  });
});
