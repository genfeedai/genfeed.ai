import { describe, expect, it } from 'vitest';
import { getModelMeta, PRISMA_MODEL_METADATA } from '../src/enum-field-map';

describe('getModelMeta', () => {
  it('resolves PascalCase model names', () => {
    const meta = getModelMeta('Account');

    expect(meta).toBeDefined();
    expect(meta?.allFields).toContain('userId');
    expect(meta?.relationIdFields.user).toBe('userId');
  });

  it('resolves camelCase model names by pascalizing the first letter', () => {
    expect(getModelMeta('account')).toBe(PRISMA_MODEL_METADATA.Account);
    expect(getModelMeta('workflowExecution')).toBe(
      PRISMA_MODEL_METADATA.WorkflowExecution,
    );
  });

  it('returns undefined for unknown models', () => {
    expect(getModelMeta('NotARealModel')).toBeUndefined();
    expect(getModelMeta('')).toBeUndefined();
  });
});

describe('PRISMA_MODEL_METADATA integrity', () => {
  it('contains model entries generated from the schema', () => {
    expect(Object.keys(PRISMA_MODEL_METADATA).length).toBeGreaterThan(0);
  });

  it('marks enum fields with their Prisma enum type', () => {
    const meta = PRISMA_MODEL_METADATA.WorkflowExecution;

    expect(meta?.enumFields.status).toEqual({
      enumType: 'WorkflowExecutionStatus',
      isRequired: true,
    });
  });

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
