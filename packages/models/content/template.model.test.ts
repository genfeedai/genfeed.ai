import { Template } from '@models/content/template.model';
import { describe, expect, it } from 'vitest';

describe('Template', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Template({});
      expect(instance).toBeDefined();
    });
  });
});
