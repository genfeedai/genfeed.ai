import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Preset: class BasePreset {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/brand.model', () => ({
  Brand: class Brand {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

vi.mock('@models/organization/organization.model', () => ({
  Organization: class Organization {
    constructor(partial: any = {}) {
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
      const instance = new Preset({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
