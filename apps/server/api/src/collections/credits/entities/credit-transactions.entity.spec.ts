import { CreditTransactionsEntity } from '@api/collections/credits/entities/credit-transactions.entity';

describe('CreditTransactionsEntity', () => {
  it('should create an instance', () => {
    const entity = new CreditTransactionsEntity();
    expect(entity).toBeInstanceOf(CreditTransactionsEntity);
  });
});
