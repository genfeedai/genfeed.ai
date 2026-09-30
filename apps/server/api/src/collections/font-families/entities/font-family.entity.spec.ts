import { FontFamilyEntity } from '@api/collections/font-families/entities/font-family.entity';

describe('FontFamilyEntity', () => {
  it('should be defined', () => {
    expect(FontFamilyEntity).toBeDefined();
  });

  it('should create an instance', () => {
    const entity = new FontFamilyEntity();
    expect(entity).toBeInstanceOf(FontFamilyEntity);
  });
});
