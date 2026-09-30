import { describe, expect, it } from 'vitest';

import {
  hasLiveReconnectStream,
  type LiveReconnectStreamInput,
} from './has-live-reconnect-stream';

const SETTLED: LiveReconnectStreamInput = {
  isStreaming: false,
  pendingUiActionCount: 0,
};

describe('hasLiveReconnectStream', () => {
  it('is false when the client is not streaming and has no pending UI', () => {
    expect(hasLiveReconnectStream(SETTLED)).toBe(false);
  });

  it('is true while the local stream is still open', () => {
    expect(
      hasLiveReconnectStream({
        ...SETTLED,
        isStreaming: true,
      }),
    ).toBe(true);
  });

  it('is true when a pending generation card still owns the turn', () => {
    expect(
      hasLiveReconnectStream({
        ...SETTLED,
        pendingUiActionCount: 1,
      }),
    ).toBe(true);
  });

  it('stays true when both the stream and a pending card are live', () => {
    expect(
      hasLiveReconnectStream({
        isStreaming: true,
        pendingUiActionCount: 1,
      }),
    ).toBe(true);
  });

  it('does not treat a bare active run id as live', () => {
    // The reconnect-recovery spec seeds `activeRunId` + `running` with an
    // empty transcript and no stream. That is the offline-tab case: the
    // server finished and snapshot restore must still run. This helper
    // therefore has no `activeRunId` field.
    expect(hasLiveReconnectStream(SETTLED)).toBe(false);
  });
});
