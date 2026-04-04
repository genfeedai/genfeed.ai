import { Authentication } from '@genfeedai/client/models/auth/authentication.model';
import { Role } from '@genfeedai/client/models/auth/role.model';
import { Credit } from '@genfeedai/client/models/billing/credit.model';
import { describe, expect, it } from 'vitest';

describe('client models', () => {
  describe('Authentication', () => {
    it('creates with token', () => {
      const auth = new Authentication({ token: 'abc123' });
      expect(auth.token).toBe('abc123');
    });

    it('creates with empty data', () => {
      const auth = new Authentication();
      expect(auth.token).toBeUndefined();
    });
  });

  describe('Role', () => {
    it('creates with data', () => {
      const role = new Role({ id: '1', key: 'admin', label: 'Admin' });
      expect(role.id).toBe('1');
      expect(role.key).toBe('admin');
      expect(role.label).toBe('Admin');
    });
  });

  describe('Credit', () => {
    it('creates with data', () => {
      const credit = new Credit({ balance: 100, entity: 'org1' });
      expect(credit.balance).toBe(100);
      expect(credit.entity).toBe('org1');
    });
  });
});
