import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  News: class BaseNews {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { News } from '@models/integrations/news.model';

describe('News', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new News({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new News({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
