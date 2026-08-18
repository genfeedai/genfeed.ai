import { VoteEntity } from '@api/collections/votes/entities/vote.entity';

describe('VoteEntity', () => {
  it('should be defined', () => {
    expect(VoteEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new VoteEntity();
    expect(entity).toBeInstanceOf(VoteEntity);
  });
});
