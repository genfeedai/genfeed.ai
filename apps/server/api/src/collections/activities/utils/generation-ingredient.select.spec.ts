import { GENERATION_INGREDIENT_SELECT } from '@api/collections/activities/utils/generation-ingredient.select';
import { getModelMeta } from '@genfeedai/prisma';
import { ingredientAttributes } from '@serializers/attributes/ingredients/ingredient.attributes';
import { metadataAttributes } from '@serializers/attributes/ingredients/metadata.attributes';
import { describe, expect, it } from 'vitest';

const HEAVY_INGREDIENT_COLUMNS = [
  'generationBilling',
  'generationProvider',
  'mediaProbe',
  'mergeSettings',
  'providerData',
];

function scalarColumns(model: string): Set<string> {
  const meta = getModelMeta(model);
  if (!meta) throw new Error(`No Prisma metadata for ${model}`);
  const relations = new Set(Object.keys(meta.relationIdFields));
  return new Set(meta.allFields.filter((field) => !relations.has(field)));
}

describe('GENERATION_INGREDIENT_SELECT', () => {
  const ingredientColumns = scalarColumns('Ingredient');
  const metadataColumns = scalarColumns('Metadata');
  const selected = new Set(
    Object.entries(GENERATION_INGREDIENT_SELECT)
      .filter(([, value]) => value === true)
      .map(([key]) => key),
  );

  it('selects every serialized ingredient column so the feed loses nothing', () => {
    const missing = ingredientAttributes.filter(
      (attribute) =>
        ingredientColumns.has(attribute) && !selected.has(attribute),
    );
    expect(missing).toEqual([]);
  });

  it('selects every column the reconciliation reads', () => {
    for (const column of [
      'category',
      'generationError',
      'id',
      'organizationId',
      'status',
      'updatedAt',
    ]) {
      expect(selected.has(column)).toBe(true);
    }
  });

  it('keeps the heavy JSON columns out of the feed', () => {
    for (const column of HEAVY_INGREDIENT_COLUMNS) {
      expect(ingredientColumns.has(column)).toBe(true);
      expect(selected.has(column)).toBe(false);
    }
  });

  it('derives cdnUrl from s3Key for the serialized ingredient', () => {
    expect(selected.has('cdnUrl')).toBe(true);
    expect(selected.has('s3Key')).toBe(true);
  });

  it('selects every serialized metadata column', () => {
    const metadataSelected = new Set(
      Object.keys(GENERATION_INGREDIENT_SELECT.metadata.select),
    );
    const missing = metadataAttributes.filter(
      (attribute) =>
        metadataColumns.has(attribute) && !metadataSelected.has(attribute),
    );
    expect(missing).toEqual([]);
    expect(metadataSelected.has('extension')).toBe(true);
  });
});
