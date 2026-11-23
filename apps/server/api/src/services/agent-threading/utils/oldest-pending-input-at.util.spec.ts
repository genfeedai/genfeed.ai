import { oldestPendingInputAt } from '@api/services/agent-threading/utils/oldest-pending-input-at.util';
import { describe, expect, it } from 'vitest';

describe('oldestPendingInputAt', () => {
  it('is null when nothing is pending', () => {
    expect(oldestPendingInputAt([])).toBeNull();
    expect(oldestPendingInputAt(undefined)).toBeNull();
  });

  it('returns the time of the oldest pending question', () => {
    expect(
      oldestPendingInputAt([
        { createdAt: '2026-11-22T10:00:00.000Z' },
        { createdAt: '2026-11-21T09:30:00.000Z' },
      ]),
    ).toEqual(new Date('2026-11-21T09:30:00.000Z'));
  });

  it('still marks the thread as waiting when no request has a readable time', () => {
    const before = Date.now();
    const at = oldestPendingInputAt([{ createdAt: 'soon' }, {}]);

    expect(at?.getTime()).toBeGreaterThanOrEqual(before);
  });
});
