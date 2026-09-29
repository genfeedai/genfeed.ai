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
