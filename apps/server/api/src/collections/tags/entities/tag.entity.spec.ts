import { TagEntity } from '@api/collections/tags/entities/tag.entity';

describe('TagEntity', () => {
  it('should be defined', () => {
    expect(TagEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new TagEntity({});
    expect(entity).toBeInstanceOf(TagEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new TagEntity();
  //     // Test properties
  //   });
  // });
});
