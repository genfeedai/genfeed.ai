import { CreativePatternsQueryDto } from '@api/collections/creative-patterns/dto/creative-patterns-query.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

async function validateQuery(query: Record<string, unknown>) {
  const dto = plainToInstance(CreativePatternsQueryDto, query);
  return { dto, errors: await validate(dto) };
}

describe('CreativePatternsQueryDto', () => {
  it('defaults to the first page', async () => {
    const { dto, errors } = await validateQuery({});

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
  });

  it('coerces page and limit from the query string', async () => {
    const { dto, errors } = await validateQuery({
      limit: '15',
      page: '4',
      patternType: 'hook_formula',
      platform: 'instagram',
      scope: 'public',
    });

    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ limit: 15, page: 4 });
  });

  it.each([
    { page: '0' },
    { limit: '0' },
    { limit: '101' },
    { patternType: 'not_a_pattern' },
    { scope: 'global' },
  ])('rejects %j', async (query) => {
    const { errors } = await validateQuery(query);

    expect(errors.length).toBeGreaterThan(0);
  });
});
