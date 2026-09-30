import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Link: class BaseLink {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/brand.model', () => ({
  Brand: class Brand {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Link } from '@models/social/link.model';

describe('Link', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Link({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Link({ id: 'test-123' } as never);
      expect(instance).toBeDefined();
    });

    it('hydrates a brand object that carries an id', () => {
      const instance = new Link({
        brand: { id: 'brand-1' },
      } as never);
      expect(instance.brand).toMatchObject({ id: 'brand-1' });
    });

    it('skips hydration when brand is not an object with id', () => {
      const instance = new Link({
        brand: 'brand-1',
      } as never);
      expect(instance.brand).toBe('brand-1');
    });
  });
});
