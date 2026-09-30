import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Folder: class BaseFolder {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Folder } from '@models/content/folder.model';

describe('Folder', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Folder({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Folder({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
