import { CreditBalanceEntity } from '@api/collections/credits/entities/credit-balance.entity';

describe('CreditBalanceEntity', () => {
  it('should create an instance', () => {
    const entity = new CreditBalanceEntity();
    expect(entity).toBeInstanceOf(CreditBalanceEntity);
  });
});
