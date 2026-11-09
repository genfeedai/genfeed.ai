import { describe, expect, it } from 'vitest';
import {
  CreditEntityModel,
  CreditTransactionCategory,
  CreditTransferKind,
} from '../../src/enums/credit.enum';

describe('credit.enum', () => {
  describe('CreditTransactionCategory', () => {
    it('should have 9 members', () => {
      expect(Object.values(CreditTransactionCategory)).toHaveLength(9);
    });

    it('should have correct values', () => {
      expect(CreditTransactionCategory.ADD).toBe('add');
      expect(CreditTransactionCategory.DEDUCT).toBe('deduct');
      expect(CreditTransactionCategory.EXPIRE).toBe('expire');
      expect(CreditTransactionCategory.RESET).toBe('reset');
      expect(CreditTransactionCategory.ROLLOVER).toBe('rollover');
      expect(CreditTransactionCategory.REFUND).toBe('refund');
      expect(CreditTransactionCategory.BYOK_USAGE).toBe('byok-usage');
      expect(CreditTransactionCategory.TRANSFER_OUT).toBe('transfer-out');
      expect(CreditTransactionCategory.TRANSFER_IN).toBe('transfer-in');
    });
  });

  describe('CreditTransferKind', () => {
    it('should have correct values', () => {
      expect(Object.values(CreditTransferKind)).toEqual([
        'tip',
        'subscription',
        'unlock',
      ]);
    });
  });

  describe('CreditEntityModel', () => {
    it('should have 2 members', () => {
      expect(Object.values(CreditEntityModel)).toHaveLength(2);
    });

    it('should have correct values', () => {
      expect(CreditEntityModel.ORGANIZATION).toBe('Organization');
      expect(CreditEntityModel.USER).toBe('User');
    });
  });
});
