import { describe, expect, it } from 'vitest';
import { selectAuthorizedVersionId } from './skill-version-pin';

describe('skill version pin', () => {
  it('keeps an execution pin ahead of a later assignment', () => {
    expect(
      selectAuthorizedVersionId({
        assignmentVersionId: 'sv-later',
        canEdit: true,
        pinnedVersionId: 'sv-first',
        pointer: {
          audience: 'organization',
          currentVersionId: 'sv-current',
          ownerKind: 'organization',
          publishedVersionId: null,
          sharedVersionId: 'sv-shared',
        },
      }),
    ).toBe('sv-first');
  });
});
