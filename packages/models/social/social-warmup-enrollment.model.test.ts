import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  SocialWarmupEnrollment: class BaseSocialWarmupEnrollment {
    public events?: unknown[];
    public signals?: unknown[];
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
  SocialWarmupEvent: class BaseSocialWarmupEvent {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
  SocialWarmupSignal: class BaseSocialWarmupSignal {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/auth/user.model', () => ({
  User: class User {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/brand.model', () => ({
  Brand: class Brand {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/organization.model', () => ({
  Organization: class Organization {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { SocialWarmupEnrollment } from './social-warmup-enrollment.model';

describe('SocialWarmupEnrollment', () => {
  it('constructs nested events and signals', () => {
    const enrollment = new SocialWarmupEnrollment({
      events: [{ id: 'event-1', itemId: 'watch-niche-content' }],
      id: 'enrollment-1',
      signals: [{ id: 'signal-1', key: 'first-upload-platform-signal' }],
    });
    expect(enrollment.events).toHaveLength(1);
    expect(enrollment.signals).toHaveLength(1);
  });
});
