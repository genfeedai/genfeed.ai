import { CaptionEntity } from '@api/collections/captions/entities/caption.entity';

describe('CaptionEntity', () => {
  it('should be defined', () => {
    expect(CaptionEntity).toBeDefined();
  });

  it('should preserve canonical persistence fields', () => {
    const entity = new CaptionEntity({
      format: 'srt',
      ingredientId: 'ingredient-1',
      language: 'en',
      organizationId: 'organization-1',
      userId: 'user-1',
    });

    expect(entity).toBeInstanceOf(CaptionEntity);
    expect(entity).toMatchObject({
      ingredientId: 'ingredient-1',
      organizationId: 'organization-1',
      userId: 'user-1',
    });
    expect(entity).not.toHaveProperty('ingredient');
  });
});
