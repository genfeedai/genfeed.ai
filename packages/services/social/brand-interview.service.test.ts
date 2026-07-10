import {
  clearAllServiceInstances,
  HTTPBaseService,
} from '@services/core/interceptor.service';
import { BrandInterviewService } from '@services/social/brand-interview.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apiEndpoint: 'https://api.genfeed.ai/v1',
  },
}));

describe('BrandInterviewService', () => {
  beforeEach(() => {
    HTTPBaseService.clearAllInstances();
    vi.clearAllMocks();
  });

  it('returns the same cached instance for a repeated token', () => {
    const first = BrandInterviewService.getInstance('token-a');
    const second = BrandInterviewService.getInstance('token-a');

    expect(first).toBeInstanceOf(BrandInterviewService);
    expect(second).toBe(first);
  });

  it('returns a distinct instance per token', () => {
    const a = BrandInterviewService.getInstance('token-a');
    const b = BrandInterviewService.getInstance('token-b');

    expect(a).not.toBe(b);
  });

  it('participates in the shared cache cleared on sign-out', () => {
    // clearAllServiceInstances() runs on logout and must wipe this service's
    // token-bound instance so stale tokens cannot leak across sessions.
    const before = BrandInterviewService.getInstance('token-a');

    clearAllServiceInstances();

    const after = BrandInterviewService.getInstance('token-a');
    expect(after).not.toBe(before);
  });
});
