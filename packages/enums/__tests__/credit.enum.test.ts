import { describe, expect, it } from 'vitest';
import {
  CreditEntityModel,
  CreditTransactionCategory,
} from '../src/credit.enum';

describe('credit.enum', () => {
  describe('CreditTransactionCategory', () => {
    it('should have 7 members', () => {
      expect(Object.values(CreditTransactionCategory)).toHaveLength(7);
    });

    it('should have correct values', () => {
      expect(CreditTransactionCategory.ADD).toBe('add');
      expect(CreditTransactionCategory.DEDUCT).toBe('deduct');
      expect(CreditTransactionCategory.EXPIRE).toBe('expire');
      expect(CreditTransactionCategory.RESET).toBe('reset');
      expect(CreditTransactionCategory.ROLLOVER).toBe('rollover');
      expect(CreditTransactionCategory.REFUND).toBe('refund');
      expect(CreditTransactionCategory.BYOK_USAGE).toBe('byok-usage');
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
