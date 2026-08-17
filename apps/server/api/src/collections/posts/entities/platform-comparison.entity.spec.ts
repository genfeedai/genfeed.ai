import { PlatformComparisonEntity } from '@api/collections/posts/entities/platform-comparison.entity';

describe('PlatformComparisonEntity', () => {
  it('should be defined', () => {
    expect(PlatformComparisonEntity).toBeDefined();
  });

  it('should create an instance with empty array', () => {
    const entity = new PlatformComparisonEntity([]);
    expect(entity).toBeInstanceOf(PlatformComparisonEntity);
  });
});
