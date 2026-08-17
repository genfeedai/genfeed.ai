import { CreditTransactionsEntity } from '@api/collections/credits/entities/credit-transactions.entity';

describe('CreditTransactionsEntity', () => {
  it('should be defined', () => {
    expect(CreditTransactionsEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new CreditTransactionsEntity();
    expect(entity).toBeInstanceOf(CreditTransactionsEntity);
  });
});
