import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Caption: class BaseCaption {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/content/ingredient.model', () => ({
  Ingredient: class Ingredient {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Caption } from '@models/content/caption.model';

describe('Caption', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Caption({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Caption({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });

    it('should construct ingredient as Ingredient', () => {
      const instance = new Caption({
        ingredient: { id: 'ingredient-1' },
      } as any);
      expect(instance.ingredient).toBeDefined();
    });

    it('should not construct ingredient when not an object', () => {
      const instance = new Caption({ ingredient: 'string-id' } as any);
      expect(instance.ingredient).toBe('string-id');
    });

    it('should handle null ingredient', () => {
      const instance = new Caption({ ingredient: null } as any);
      expect(instance).toBeDefined();
    });
  });
});
