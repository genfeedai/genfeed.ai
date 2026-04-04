import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Link: class BaseLink {
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

import { Link } from '@models/social/link.model';

describe('Link', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Link({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Link({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
