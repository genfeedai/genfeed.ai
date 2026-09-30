import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  MonitoredAccount: class BaseMonitoredAccount {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { MonitoredAccount } from '@models/automation/monitored-account.model';

describe('MonitoredAccount', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new MonitoredAccount({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new MonitoredAccount({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });
  });
});
