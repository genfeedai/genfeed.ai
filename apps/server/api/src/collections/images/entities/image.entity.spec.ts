import { ImageEntity } from '@api/collections/images/entities/image.entity';

describe('ImageEntity', () => {
  it('should create an instance', () => {
    const entity = new ImageEntity();
    expect(entity).toBeInstanceOf(ImageEntity);
  });
});
