import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Mood: class BaseElementMood {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { ElementMood } from '@models/elements/mood.model';

describe('ElementMood', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new ElementMood({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new ElementMood({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
