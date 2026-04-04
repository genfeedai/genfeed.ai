import { VoteEntity } from '@api/collections/votes/entities/vote.entity';

describe('VoteEntity', () => {
  it('should be defined', () => {
    expect(VoteEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new VoteEntity();
    expect(entity).toBeInstanceOf(VoteEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new VoteEntity();
  //     // Test properties
  //   });
  // });
});
