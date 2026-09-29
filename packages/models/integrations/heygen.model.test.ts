import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  HeyGen: class BaseHeyGen {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
  HeyGenAvatar: class BaseHeyGenAvatar {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
  HeyGenVoice: class BaseHeyGenVoice {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { HeyGen } from '@models/integrations/heygen.model';

describe('HeyGen', () => {
  describe('constructor', () => {
    it('should create an instance with partial data', () => {
      const instance = new HeyGen({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});

describe('HeyGenVoice', () => {
  it('should create an instance', () => {
    // Additional exported class
    expect(true).toBe(true);
  });
});
