import { getModelMeta } from '@genfeedai/prisma';
import { isTenantScopedFieldSet } from '@libs/prisma/discover-tenant-models';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import {
  isPlatformRowModel,
  PLATFORM_ROW_MODELS,
  scopeWhereToTenant,
  whereNamesOrganization,
} from './tenant-scope';

describe('tenant-scope', () => {
  describe('PLATFORM_ROW_MODELS', () => {
    it.each([...PLATFORM_ROW_MODELS])('%s is a tenant model', (model) => {
      const meta = getModelMeta(model);

      expect(meta).toBeDefined();
      expect(isTenantScopedFieldSet(meta?.allFields ?? [])).toBe(true);
    });

    it('matches delegate names in camelCase', () => {
      expect(isPlatformRowModel('tag')).toBe(true);
      expect(isPlatformRowModel('fontFamilyRecord')).toBe(true);
      expect(isPlatformRowModel('brand')).toBe(false);
    });
  });

  describe('whereNamesOrganization', () => {
    it.each([
      [{ organizationId: 'o1' }, true],
      [{ organizationId: { equals: 'o1' } }, true],
      [{ organizationId: { in: ['o1'] } }, true],
      [{ OR: [{ organizationId: 'o1' }] }, true],
      [{ AND: [{ OR: [{ organizationId: 'o1' }] }] }, true],
      [{ organizationId: null }, false],
      [{ organizationId: { not: 'o1' } }, false],
      [{ id: 'x' }, false],
      [{}, false],
    ])('%j -> %s', (where, expected) => {
      expect(whereNamesOrganization(where)).toBe(expected);
    });
  });

  describe('scopeWhereToTenant', () => {
    it('returns the filter unchanged without a tenant context', () => {
      const where = { id: 'x' };

      expect(scopeWhereToTenant(where, 'brand', 'read')).toBe(where);
    });

    it('wraps a single AND object when adding the platform arm', () => {
      const result = runWithTenantContext({ organizationId: 'o1' }, () =>
        scopeWhereToTenant({ AND: { slug: 'a' } }, 'tag', 'read'),
      );

      expect(result).toEqual({
        AND: [
          { slug: 'a' },
          { OR: [{ organizationId: null }, { organizationId: 'o1' }] },
        ],
      });
    });
  });
});
