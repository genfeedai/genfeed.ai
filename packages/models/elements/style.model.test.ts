import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Style: class BaseElementStyle {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { ElementStyle } from '@models/elements/style.model';

describe('ElementStyle', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new ElementStyle({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new ElementStyle({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
