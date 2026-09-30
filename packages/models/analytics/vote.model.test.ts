import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Vote: class BaseVote {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Vote } from '@models/analytics/vote.model';

describe('Vote', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Vote({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Vote({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
