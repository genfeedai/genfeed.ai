import { VoteEntity } from '@api/collections/votes/entities/vote.entity';

describe('VoteEntity', () => {
  it('should create an instance', () => {
    const entity = new VoteEntity();
    expect(entity).toBeInstanceOf(VoteEntity);
  });
});
