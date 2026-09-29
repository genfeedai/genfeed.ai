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
    it('should not construct ingredient when not an object', () => {
      const instance = new Caption({ ingredient: 'string-id' } as any);
      expect(instance.ingredient).toBe('string-id');
    });
  });
});
