import { ValidationException } from '@api/exceptions/validation.exception';
import type { ModelFieldMeta } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';

const { getModelMetaMock } = vi.hoisted(() => ({
  getModelMetaMock: vi.fn<(modelName: string) => ModelFieldMeta | undefined>(),
}));

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return {
    ...canonicalPrismaMock(),
    getModelMeta: getModelMetaMock,
  };
});

import { BaseQueryNormalizationAdapter } from '@api/shared/services/base/base-query-normalization.adapter';

function makeModelMeta(
  ...fields: Array<
    string | { enumType: string; isRequired?: boolean; name: string }
  >
): ModelFieldMeta {
  const allFields: string[] = [];
  const enumFields: Record<string, { enumType: string; isRequired: boolean }> =
    {};

  for (const field of fields) {
    if (typeof field === 'string') {
      allFields.push(field);
      continue;
    }

    allFields.push(field.name);
    enumFields[field.name] = {
      enumType: field.enumType,
      isRequired: field.isRequired ?? false,
    };
  }

  return { allFields, enumFields, listFields: [], relationIdFields: {} };
}

describe('BaseQueryNormalizationAdapter', () => {
  let adapter: BaseQueryNormalizationAdapter;
  let logger: { warn: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    getModelMetaMock.mockReturnValue(
      makeModelMeta(
        'id',
        'isDeleted',
        'organizationId',
        'brand',
        { enumType: 'IngredientCategory', name: 'category' },
        { enumType: 'ArticleStatus', name: 'status' },
      ),
    );
    logger = { warn: vi.fn() };
    adapter = new BaseQueryNormalizationAdapter(
      'testModel',
      logger as unknown as LoggerService,
    );
  });

  it('builds nested Prisma includes from populate options', () => {
    expect(
      adapter.populateToInclude([
        {
          path: 'brand',
          populate: { path: 'organization' },
          select: ['id', 'label'],
        },
      ]),
    ).toEqual({
      brand: {
        select: {
          id: true,
          label: true,
          organization: true,
        },
      },
    });
  });

  it('rejects projections that reference unknown Prisma fields', () => {
    expect(() =>
      adapter.assertProjectionFields({ missing: true }, 'select'),
    ).toThrow(ValidationException);
  });

  it('normalizes compound enum filters and applies the soft-delete default', () => {
    const rawWhere = {
      AND: [{ category: 'image-edit', status: 'public' }],
      organizationId: 'org-1',
    };

    expect(
      adapter.withSoftDeleteFilter(adapter.normalizeWhere(rawWhere), rawWhere),
    ).toEqual({
      AND: [{ category: 'IMAGE_EDIT', status: 'PUBLISHED' }],
      isDeleted: false,
      organizationId: 'org-1',
    });
  });

  it('drops normalized-empty OR branches instead of emitting a match-all object', () => {
    getModelMetaMock.mockReturnValue(
      makeModelMeta('id', 'organizationId', {
        enumType: 'ArticleStatus',
        isRequired: true,
        name: 'status',
      }),
    );

    expect(
      adapter.normalizeWhere({
        OR: [{ status: { not: null } }],
        organizationId: 'org-1',
      }),
    ).toEqual({ organizationId: 'org-1' });
  });

  it('preserves an explicit empty OR as a no-match filter', () => {
    expect(adapter.normalizeWhere({ OR: [], organizationId: 'org-1' })).toEqual(
      { OR: [], organizationId: 'org-1' },
    );
  });

  it('preserves an explicit undefined soft-delete opt-out', () => {
    const rawWhere = {
      isDeleted: undefined,
      organizationId: 'org-1',
    };

    expect(
      adapter.withSoftDeleteFilter(adapter.normalizeWhere(rawWhere), rawWhere),
    ).toEqual({ organizationId: 'org-1' });
  });

  it('resolves explicit Prisma query input and deterministic multi-field sorting', () => {
    expect(
      adapter.resolveFindAllInput(
        {
          include: { brand: true },
          orderBy: { createdAt: 'asc', id: -1 },
          where: { status: 'public' },
        },
        { limit: 10, organizationId: 'org-1', page: 2 },
      ),
    ).toEqual({
      include: { brand: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'desc' }],
      select: undefined,
      where: { organizationId: 'org-1', status: 'public' },
    });
  });

  it('drops undefined write keys and normalizes enum values', () => {
    expect(
      adapter.normalizeData({
        category: 'image-edit',
        label: undefined,
        status: 'public',
      }),
    ).toEqual({ category: 'IMAGE_EDIT', status: 'PUBLISHED' });
  });

  it('warns without throwing when a filter references an unknown field', () => {
    adapter.auditUnknownFilterFields({ organizationId: 'org-1', stage: 'x' });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('unknown field "stage"'),
      { field: 'stage', model: 'testModel', operation: 'findAll' },
    );
  });
});
