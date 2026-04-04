import { CaptionEntity } from '@api/collections/captions/entities/caption.entity';

describe('CaptionEntity', () => {
  it('should be defined', () => {
    expect(CaptionEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new CaptionEntity();
    expect(entity).toBeInstanceOf(CaptionEntity);
  });

  // describe('properties', () => {
  //   it('should have expected properties', () => {
  //     const entity = new CaptionEntity();
  //     // Test properties
  //   });
  // });
});
