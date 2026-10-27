import { resolveSlotOutcomeOrganizations } from '@api/collections/content-learning/utils/learning-prompt-slot-organizations.util';

describe('resolveSlotOutcomeOrganizations', () => {
  it('reads one organization from organizationId', () => {
    expect(
      resolveSlotOutcomeOrganizations({ organizationId: ' org-1 ' }),
    ).toEqual({ organizationIds: ['org-1'] });
  });

  it('reads the unique ids of a pooled list', () => {
    expect(
      resolveSlotOutcomeOrganizations({ organizationIds: 'a, b,,a ,c' }),
    ).toEqual({ organizationIds: ['a', 'b', 'c'] });
  });

  it.each([
    ['neither', {}],
    ['both', { organizationId: 'a', organizationIds: 'b,c' }],
    [
      'too many',
      {
        organizationIds: Array.from({ length: 21 }, (_, i) => `o${i}`).join(
          ',',
        ),
      },
    ],
  ])('rejects a request with %s', (_label, dto) => {
    expect(resolveSlotOutcomeOrganizations(dto)).toHaveProperty('error');
  });
});
