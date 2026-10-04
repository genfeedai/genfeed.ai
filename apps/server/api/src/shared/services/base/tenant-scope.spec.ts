import { getModelMeta } from '@genfeedai/prisma';
import { isTenantScopedFieldSet } from '@libs/prisma/discover-tenant-models';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';
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

    describe('guard depth limit', () => {
      // `where` is depth 1 in the guard; each AND level adds one.
      function nestedProof(proofDepth: number): Record<string, unknown> {
        let node: Record<string, unknown> = { organizationId: 'o1' };
        for (let depth = proofDepth; depth > 1; depth -= 1) {
          node = { AND: [node] };
        }
        return node;
      }
      const guard = (where: Record<string, unknown>) => () =>
        runWithTenantContext({ organizationId: 'o1' }, () =>
          assertTenantScopedQuery({
            args: { where },
            isCloud: true,
            model: 'Brand',
            operation: 'findMany',
            tenantModelNames: new Set(['Brand']),
          }),
        );

      it('leaves a proof the guard can still see (depth 8) untouched', () => {
        const where = nestedProof(8);
        const result = runWithTenantContext({ organizationId: 'o1' }, () =>
          scopeWhereToTenant(where, 'brand', 'read'),
        );

        expect(result).toBe(where);
        expect(guard(result)).not.toThrow();
      });

      it('adds the tenant at the top level when the proof is below the guard limit', () => {
        const where = nestedProof(9);

        expect(guard(where)).toThrow();

        const result = runWithTenantContext({ organizationId: 'o1' }, () =>
          scopeWhereToTenant(where, 'brand', 'read'),
        );

        expect(result.organizationId).toBe('o1');
        expect(result.AND).toBe(where.AND);
        expect(guard(result)).not.toThrow();
      });

      it('merges the platform arm into the top-level AND array', () => {
        const result = runWithTenantContext({ organizationId: 'o1' }, () =>
          scopeWhereToTenant(
            { AND: [{ slug: 'b' }], slug: 'a' },
            'tag',
            'read',
          ),
        );

        expect(result).toEqual({
          AND: [
            { slug: 'b' },
            { OR: [{ organizationId: null }, { organizationId: 'o1' }] },
          ],
          slug: 'a',
        });
      });
    });
  });
});
