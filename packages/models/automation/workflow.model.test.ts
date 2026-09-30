import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  Workflow: class BaseWorkflow {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { Workflow } from '@models/automation/workflow.model';

describe('Workflow', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new Workflow({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new Workflow({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
