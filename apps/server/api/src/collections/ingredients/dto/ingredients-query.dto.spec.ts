import { IngredientsQueryDto } from '@api/collections/ingredients/dto/ingredients-query.dto';
import { MAX_CHARACTER_FILTER_IDS } from '@api/helpers/dto/ingredient-characters-query.transform';
import { testId, testIds } from '@helpers/testing/test-id.helper';
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

    it('accepts repeated origins keys and normalizes their case', async () => {
      const dto = plainToInstance(IngredientsQueryDto, {
        origins: ['uploaded', 'IMPORTED'],
      });

      expect(await validate(dto)).toHaveLength(0);
      expect(dto.origins).toEqual(['UPLOADED', 'IMPORTED']);
    });

    it('accepts repeated characters keys and de-duplicates them', async () => {
      const first = testId('character', 1);
      const second = testId('character', 2);
      const dto = plainToInstance(IngredientsQueryDto, {
        characters: [first, second, first],
      });

      expect(await validate(dto)).toHaveLength(0);
      expect(dto.characters).toEqual([first, second]);
    });

    it('wraps a single character id and leaves it unset when absent', () => {
      const id = testId('character');

      expect(
        plainToInstance(IngredientsQueryDto, { characters: id }).characters,
      ).toEqual([id]);
      expect(
        plainToInstance(IngredientsQueryDto, {}).characters,
      ).toBeUndefined();
    });

    it('rejects a malformed character id instead of listing everything', async () => {
      const dto = plainToInstance(IngredientsQueryDto, {
        characters: [testId('character'), 'not an id!'],
      });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('characters');
    });

    it('rejects an empty characters value instead of listing everything', async () => {
      const dto = plainToInstance(IngredientsQueryDto, { characters: '' });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('characters');
    });

    it('rejects an oversized character list', async () => {
      const dto = plainToInstance(IngredientsQueryDto, {
        characters: testIds('character', MAX_CHARACTER_FILTER_IDS + 1),
      });

      const errors = await validate(dto);

      expect(errors.map((error) => error.property)).toContain('characters');
    });

    it('wraps a single origin and leaves it unset when absent', async () => {
      const single = plainToInstance(IngredientsQueryDto, {
        origins: 'generated',
      });
      const none = plainToInstance(IngredientsQueryDto, {});

      expect(single.origins).toEqual(['GENERATED']);
      expect(none.origins).toBeUndefined();
    });

    it('rejects an unknown origin instead of returning an empty Library', async () => {
      const dto = plainToInstance(IngredientsQueryDto, { origins: ['mine'] });

      expect((await validate(dto)).length).toBeGreaterThan(0);
    });
  });
});
