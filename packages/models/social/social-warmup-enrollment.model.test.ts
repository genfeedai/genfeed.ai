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

import {
  SocialWarmupEnrollment,
  SocialWarmupEvent,
  SocialWarmupSignal,
} from './social-warmup-enrollment.model';

describe('SocialWarmupEvent', () => {
  it('hydrates nested organization, brand, and actor user objects', () => {
    const event = new SocialWarmupEvent({
      actorUser: { id: 'user-1' },
      brand: { id: 'brand-1' },
      id: 'event-1',
      organization: { id: 'org-1' },
    });
    expect(event.organization).toMatchObject({ id: 'org-1' });
    expect(event.brand).toMatchObject({ id: 'brand-1' });
    expect(event.actorUser).toMatchObject({ id: 'user-1' });
  });

  it('skips nested hydration when relations are not objects', () => {
    const event = new SocialWarmupEvent({
      actorUser: 'user-1',
      brand: 'brand-1',
      organization: 'org-1',
    } as never);
    expect(event.organization).toBe('org-1');
    expect(event.brand).toBe('brand-1');
    expect(event.actorUser).toBe('user-1');
  });
});

describe('SocialWarmupSignal', () => {
  it('hydrates nested organization and brand objects', () => {
    const signal = new SocialWarmupSignal({
      brand: { id: 'brand-1' },
      id: 'signal-1',
      organization: { id: 'org-1' },
    });
    expect(signal.organization).toMatchObject({ id: 'org-1' });
    expect(signal.brand).toMatchObject({ id: 'brand-1' });
  });
});

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

  it('hydrates enrollment relations and defaults missing collections', () => {
    const enrollment = new SocialWarmupEnrollment({
      brand: { id: 'brand-1' },
      enrolledByUser: { id: 'user-1' },
      id: 'enrollment-2',
      organization: { id: 'org-1' },
    });
    expect(enrollment.organization).toMatchObject({ id: 'org-1' });
    expect(enrollment.brand).toMatchObject({ id: 'brand-1' });
    expect(enrollment.enrolledByUser).toMatchObject({ id: 'user-1' });
    expect(enrollment.events).toEqual([]);
    expect(enrollment.signals).toEqual([]);
  });
});
