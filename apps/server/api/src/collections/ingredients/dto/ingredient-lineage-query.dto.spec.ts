import { IngredientLineageQueryDto } from '@api/collections/ingredients/dto/ingredient-lineage-query.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

describe('IngredientLineageQueryDto', () => {
  it('defaults to the first page of 24', async () => {
    const dto = plainToInstance(IngredientLineageQueryDto, {});

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ limit: 24, page: 1 });
  });

  it('declares page and limit so the whitelisting pipe keeps them', async () => {
    const dto = plainToInstance(IngredientLineageQueryDto, {
      limit: '12',
      page: '3',
    });

    expect(
      await validate(dto, { forbidNonWhitelisted: true, whitelist: true }),
    ).toHaveLength(0);
    expect(dto).toMatchObject({ limit: 12, page: 3 });
  });

  it.each([{ page: '0' }, { limit: '0' }, { limit: '101' }, { page: 'abc' }])(
    'rejects %o',
    async (query) => {
      const dto = plainToInstance(IngredientLineageQueryDto, query);

      expect((await validate(dto)).length).toBeGreaterThan(0);
    },
  );
});
