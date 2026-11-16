import { MemberSerializer } from '@serializers/server/organizations/member.serializer';
import { describe, expect, it } from 'vitest';

describe('MemberSerializer', () => {
  it('keeps the brands a member is assigned to', () => {
    const document = MemberSerializer.serialize({
      brands: [
        { id: 'brand-1', label: 'Launch' },
        { id: 'brand-2', label: 'Recap' },
      ],
      id: 'member-1',
      organizationId: 'org-1',
      userId: 'user-1',
    });

    expect(
      document.data.relationships?.brands?.data.map(
        (brand: { id: string }) => brand.id,
      ),
    ).toEqual(['brand-1', 'brand-2']);
  });
});
