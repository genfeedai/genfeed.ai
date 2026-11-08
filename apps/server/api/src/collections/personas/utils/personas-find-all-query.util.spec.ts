import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { PersonasQueryDto } from '@api/collections/personas/dto/personas-query.dto';
import { buildPersonasFindAllQuery } from '@api/collections/personas/utils/personas-find-all-query.util';
import { describe, expect, it } from 'vitest';

const user = { brandId: 'brand_session', organizationId: 'org_1' } as User;
const allBrands = { allBrands: true } as PersonasQueryDto;

describe('buildPersonasFindAllQuery', () => {
  it('spans the organization when the caller may access every brand', () => {
    const { where } = buildPersonasFindAllQuery(user, allBrands);

    expect(where).toMatchObject({ isDeleted: false, organizationId: 'org_1' });
    expect(where).not.toHaveProperty('brandId');
  });

  it('limits an all-brands read to the caller allowlist', () => {
    const { where } = buildPersonasFindAllQuery(user, allBrands, [
      'brand_a',
      'brand_b',
    ]);

    expect(where).toMatchObject({ brandId: { in: ['brand_a', 'brand_b'] } });
  });

  it('returns nothing for a caller assigned to no brands', () => {
    const { where } = buildPersonasFindAllQuery(user, allBrands, []);

    expect(where).toMatchObject({ brandId: { in: [] } });
  });
});
