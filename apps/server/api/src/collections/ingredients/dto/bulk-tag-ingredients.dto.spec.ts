import { BulkTagIngredientsDto } from '@api/collections/ingredients/dto/bulk-tag-ingredients.dto';
import { TagBulkAction } from '@genfeedai/contracts';
import { LIBRARY_BULK_TAG_LIMIT } from '@genfeedai/contracts/constants';
import { testId, testIds } from '@helpers/testing/test-id.helper';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

function build(overrides: Record<string, unknown> = {}) {
  return plainToInstance(BulkTagIngredientsDto, {
    action: TagBulkAction.ADD,
    ids: testIds('ingredient', 3),
    tagId: testId('tag'),
    ...overrides,
  });
}

describe('BulkTagIngredientsDto', () => {
  it('accepts an add or remove of one tag on a few assets', async () => {
    for (const action of Object.values(TagBulkAction)) {
      expect(await validate(build({ action }))).toHaveLength(0);
    }
  });

  it('accepts exactly the limit of assets', async () => {
    const dto = build({ ids: testIds('ingredient', LIBRARY_BULK_TAG_LIMIT) });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects more than the limit and states the limit', async () => {
    const dto = build({
      ids: testIds('ingredient', LIBRARY_BULK_TAG_LIMIT + 1),
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(1);
    expect(errors[0]?.property).toBe('ids');
    expect(errors[0]?.constraints?.arrayMaxSize).toContain(
      String(LIBRARY_BULK_TAG_LIMIT),
    );
  });

  it('rejects an empty selection', async () => {
    const errors = await validate(build({ ids: [] }));

    expect(errors.map((error) => error.property)).toContain('ids');
  });

  it('rejects a malformed asset id, tag id or unknown action', async () => {
    for (const [field, value] of [
      ['ids', [testId('ingredient'), 'not an id!']],
      ['tagId', 'not an id!'],
      ['action', 'toggle'],
    ] as const) {
      const errors = await validate(build({ [field]: value }));

      expect(errors.map((error) => error.property)).toContain(field);
    }
  });
});
