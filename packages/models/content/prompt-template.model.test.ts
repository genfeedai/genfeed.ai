import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  PromptTemplate: class BasePromptTemplate {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { PromptTemplate } from '@models/content/prompt-template.model';

describe('PromptTemplate', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new PromptTemplate({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new PromptTemplate({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
