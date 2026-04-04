import { describe, expect, it, vi } from 'vitest';

vi.mock('@models/content/ingredient.model', () => ({
  Ingredient: class Ingredient {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Avatar } from '@models/ai/avatar.model';

describe('Avatar', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Avatar({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Avatar({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
