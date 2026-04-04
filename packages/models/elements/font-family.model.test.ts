import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  FontFamily: class BaseFontFamily {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { FontFamily } from '@models/elements/font-family.model';

describe('FontFamily', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new FontFamily({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new FontFamily({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
