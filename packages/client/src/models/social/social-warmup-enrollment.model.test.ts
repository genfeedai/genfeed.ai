import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models/base/base-entity.model', () => ({
  BaseEntity: class BaseEntity {
    public id?: string;
    constructor(data: Record<string, unknown> = {}) {
      Object.assign(this, data);
    }
  },
}));

import { SocialWarmupEnrollment } from './social-warmup-enrollment.model';

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
