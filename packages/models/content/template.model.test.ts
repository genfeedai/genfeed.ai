import { Template } from '@models/content/template.model';
import { describe, expect, it } from 'vitest';

describe('Template', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Template({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Template({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
