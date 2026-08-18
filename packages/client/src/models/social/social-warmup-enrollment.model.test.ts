import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models/base/base-entity.model', () => ({
  BaseEntity: class BaseEntity {
    public id?: string;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
    }
  },
}));

import {
  SocialWarmupEnrollment,
  SocialWarmupEvent,
  SocialWarmupSignal,
} from './social-warmup-enrollment.model';

describe('SocialWarmupEnrollment (client model)', () => {
  it('constructs with partial data', () => {
    const enrollment = new SocialWarmupEnrollment({
      credentialId: 'credential-1',
      id: 'enrollment-1',
    });
    expect(enrollment.id).toBe('enrollment-1');
    expect(enrollment.credentialId).toBe('credential-1');
  });
});

describe('SocialWarmupEvent (client model)', () => {
  it('constructs with partial data', () => {
    const event = new SocialWarmupEvent({
      id: 'event-1',
      itemId: 'watch-niche-content',
    });
    expect(event.id).toBe('event-1');
    expect(event.itemId).toBe('watch-niche-content');
  });
});

describe('SocialWarmupSignal (client model)', () => {
  it('constructs with partial data', () => {
    const signal = new SocialWarmupSignal({
      id: 'signal-1',
      key: 'first-upload-platform-signal',
    });
    expect(signal.id).toBe('signal-1');
    expect(signal.key).toBe('first-upload-platform-signal');
  });
});
