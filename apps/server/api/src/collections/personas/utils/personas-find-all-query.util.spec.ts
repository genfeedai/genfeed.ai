import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { PersonasQueryDto } from '@api/collections/personas/dto/personas-query.dto';
import { buildPersonasFindAllQuery } from '@api/collections/personas/utils/personas-find-all-query.util';
import { PersonaAvailabilityMode } from '@genfeedai/contracts';
import { describe, expect, it } from 'vitest';

const user = { brandId: 'brand_session', organizationId: 'org_1' } as User;
const allBrands = { allBrands: true } as PersonasQueryDto;

describe('buildPersonasFindAllQuery', () => {
  it('spans the organization when the caller may access every brand', () => {
    const { where } = buildPersonasFindAllQuery(user, allBrands);

    expect(where).toMatchObject({ isDeleted: false, organizationId: 'org_1' });
    expect(where).not.toHaveProperty('brandId');
  });

  it('keeps owned, shared and unbranded characters for a restricted caller', () => {
    const { where } = buildPersonasFindAllQuery(user, allBrands, [
      'brand_a',
      'brand_b',
    ]);

    expect(where).not.toHaveProperty('brandId');
    expect(where.AND).toEqual([
      {
        OR: [
          { brandId: { in: ['brand_a', 'brand_b'] } },
          { brandId: null },
          { availabilityMode: PersonaAvailabilityMode.ALL_BRANDS },
          {
            availabilityMode: PersonaAvailabilityMode.SELECTED_BRANDS,
            availableBrandIds: { hasSome: ['brand_a', 'brand_b'] },
          },
        ],
      },
    ]);
  });

  it('shows a caller assigned to no brands only the unbranded characters', () => {
    const { where } = buildPersonasFindAllQuery(user, allBrands, []);

    expect(where.AND).toEqual([
      { OR: [{ brandId: { in: [] } }, { brandId: null }] },
    ]);
  });

  it('keeps the name filter beside the restricted scope', () => {
    const { where } = buildPersonasFindAllQuery(
      user,
      { allBrands: true, q: 'an' } as PersonasQueryDto,
      ['brand_a'],
    );

    expect(where.OR).toHaveLength(2);
    expect(where.AND).toHaveLength(1);
  });
});
