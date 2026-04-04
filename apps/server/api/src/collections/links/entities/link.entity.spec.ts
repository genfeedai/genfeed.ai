import { LinkEntity } from '@api/collections/links/entities/link.entity';

describe('LinkEntity', () => {
  it('should be defined', () => {
    expect(LinkEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new LinkEntity();
    expect(entity).toBeInstanceOf(LinkEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new LinkEntity();
  //     // Test properties
  //   });
  // });
});
