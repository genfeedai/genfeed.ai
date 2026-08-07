import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('IngredientsQueryDto', () => {
  it('should be defined', () => {
    expect(IngredientsQueryDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new IngredientsQueryDto();
      expect(dto).toBeInstanceOf(IngredientsQueryDto);
    });

    it('should accept repeated status query keys as an array', async () => {
      // Express parses ?status=a&status=b as an array on req.query.
      // Legacy lowercase is uppercased to Prisma IngredientStatus labels.
      const dto = plainToInstance(IngredientsQueryDto, {
        status: ['generated', 'processing', 'validated'],
      });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
      expect(dto.status).toEqual(['GENERATED', 'PROCESSING', 'VALIDATED']);
    });

    it('should normalize a single status value into an array', async () => {
      const dto = plainToInstance(IngredientsQueryDto, { status: 'GENERATED' });
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
      expect(dto.status).toEqual(['GENERATED']);
    });

    it('should validate successfully with no status filter', async () => {
      const dto = plainToInstance(IngredientsQueryDto, {});
      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
      expect(dto.status).toBeUndefined();
    });
  });
});
