import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/client/models', () => ({
  OrganizationSetting: class BaseOrganizationSetting {
    constructor(partial: any = {}) {
      Object.assign(this, partial);
    }
  },
}));

import { OrganizationSetting } from '@models/organization/organization-setting.model';

describe('OrganizationSetting', () => {
  describe('constructor', () => {
    it('should create an instance with empty partial', () => {
      const instance = new OrganizationSetting({});
      expect(instance).toBeDefined();
    });

    it('should create an instance with partial data', () => {
      const instance = new OrganizationSetting({ id: 'test-123' } as any);
      expect(instance).toBeDefined();
    });

    it('normalizes bson-like enabledModels values into string ids', () => {
      const instance = new OrganizationSetting({
        enabledModels: [
          {
            buffer: [
              0x50, 0x7f, 0x1f, 0x77, 0xbc, 0xf8, 0x6c, 0xd7, 0x99, 0x43, 0x90,
              0x11,
            ],
          },
          'openrouter/auto',
        ],
      } as never);

      expect(instance.enabledModels).toEqual([
        '507f1f77bcf86cd799439011',
        'openrouter/auto',
      ]);
    });
  });
});
