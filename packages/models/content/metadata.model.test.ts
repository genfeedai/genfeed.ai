import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Metadata: class BaseMetadata {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Metadata } from '@models/content/metadata.model';

describe('Metadata', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Metadata({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Metadata({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
