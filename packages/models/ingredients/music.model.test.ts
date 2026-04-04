import { describe, expect, it, vi } from 'vitest';

vi.mock('@models/content/ingredient.model', () => ({
  Ingredient: class Ingredient {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Music } from '@models/ingredients/music.model';

describe('Music', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Music({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Music({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
