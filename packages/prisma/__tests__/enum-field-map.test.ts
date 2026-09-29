import { describe, expect, it } from 'vitest';
import { getModelMeta, PRISMA_MODEL_METADATA } from '../src/enum-field-map';

describe('getModelMeta', () => {
  it('resolves PascalCase model names', () => {
    const meta = getModelMeta('Account');

    expect(meta).toBeDefined();
    expect(meta?.allFields).toContain('userId');
    expect(meta?.relationIdFields.user).toBe('userId');
  });
});

describe('PRISMA_MODEL_METADATA integrity', () => {
  it('keeps every enum field and relation alias inside allFields', () => {
    for (const [modelName, meta] of Object.entries(PRISMA_MODEL_METADATA)) {
      const allFields = new Set(meta.allFields);

      for (const enumField of Object.keys(meta.enumFields)) {
        expect(
          allFields.has(enumField),
          `${modelName}.${enumField} missing from allFields`,
        ).toBe(true);
      }

      for (const [alias, scalarField] of Object.entries(
        meta.relationIdFields,
      )) {
        expect(
          allFields.has(alias),
          `${modelName}.${alias} alias missing from allFields`,
        ).toBe(true);
        expect(
          allFields.has(scalarField),
          `${modelName}.${scalarField} FK missing from allFields`,
        ).toBe(true);
      }
    }
  });
});
