import {
  BULK_DELETE_INGREDIENTS_MAX_IDS,
  BulkDeleteIngredientsDto,
} from '@api/collections/ingredients/dto/bulk-delete-ingredients.dto';
import { validate } from 'class-validator';

function buildIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    index.toString(16).padStart(24, '0'),
  );
}

describe('BulkDeleteIngredientsDto', () => {
  it('should be defined', () => {
    expect(BulkDeleteIngredientsDto).toBeDefined();
  });

  describe('validation', () => {
    it('should create an instance', () => {
      const dto = new BulkDeleteIngredientsDto();
      expect(dto).toBeInstanceOf(BulkDeleteIngredientsDto);
    });

    it('accepts an id list at the maximum size', async () => {
      const dto = Object.assign(new BulkDeleteIngredientsDto(), {
        ids: buildIds(BULK_DELETE_INGREDIENTS_MAX_IDS),
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });

    it('rejects an id list over the maximum size', async () => {
      const dto = Object.assign(new BulkDeleteIngredientsDto(), {
        ids: buildIds(BULK_DELETE_INGREDIENTS_MAX_IDS + 1),
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(1);
      expect(errors[0]?.property).toBe('ids');
      expect(errors[0]?.constraints).toHaveProperty('arrayMaxSize');
    });

    // `@IsNotEmpty()` only rejects '', null and undefined — an empty array
    // passes it. The endpoint short-circuits on an empty list instead of
    // touching the database, so validation deliberately lets it through.
    it('accepts an empty id list', async () => {
      const dto = Object.assign(new BulkDeleteIngredientsDto(), {
        ids: [],
      });

      const errors = await validate(dto);

      expect(errors).toHaveLength(0);
    });
  });
});
