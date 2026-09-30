import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Preset: class BasePreset {
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

vi.mock('@models/organization/organization.model', () => ({
  Organization: class Organization {
    constructor(partial: Record<string, unknown> = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Preset } from '@models/elements/preset.model';

describe('Preset', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Preset({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Preset({ id: 'test-123' } as never);
      expect(instance).toBeDefined();
    });

    it('hydrates organization and brand objects that carry an id', () => {
      const instance = new Preset({
        brand: { id: 'brand-1' },
        organization: { id: 'org-1' },
      } as never);
      expect(instance.organization).toMatchObject({ id: 'org-1' });
      expect(instance.brand).toMatchObject({ id: 'brand-1' });
    });

    it('skips hydration when organization or brand is not an object with id', () => {
      const instance = new Preset({
        brand: 'brand-1',
        organization: 'org-1',
      } as never);
      expect(instance.organization).toBe('org-1');
      expect(instance.brand).toBe('brand-1');
    });
  });
});
