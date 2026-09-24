import { describe, expect, it } from 'vitest';
import { selectAuthorizedVersionId } from './skill-authorized-version';

describe('selectAuthorizedVersionId', () => {
  it('uses the shared publication instead of the current draft', () => {
    expect(
      selectAuthorizedVersionId({
        canEdit: false,
        pointer: {
          audience: 'organization',
          currentVersionId: 'sv-current',
          ownerKind: 'organization',
          publishedVersionId: null,
          sharedVersionId: 'sv-shared',
        },
      }),
    ).toBe('sv-shared');
  });
});
