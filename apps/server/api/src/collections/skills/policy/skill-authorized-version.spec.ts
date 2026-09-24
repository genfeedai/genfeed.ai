import { describe, expect, it } from 'vitest';
import {
  chooseAuthorizedVersionId,
  chooseReadableVersionId,
} from './skill-authorized-version';

const pointer = {
  audience: 'organization',
  currentVersionId: 'sv-current',
  ownerKind: 'organization',
  publishedVersionId: null,
  sharedVersionId: 'sv-shared',
};

describe('chooseAuthorizedVersionId', () => {
  it('keeps an assigned version ahead of a newer current draft', () => {
    expect(
      chooseAuthorizedVersionId({
        assignmentVersionId: 'sv-assigned',
        canEdit: true,
        pointer: { ...pointer, currentVersionId: 'sv-draft' },
      }),
    ).toBe('sv-assigned');
  });

  it('uses a live grant ahead of the shared pointer', () => {
    expect(
      chooseAuthorizedVersionId({
        canEdit: false,
        grantVersionId: 'sv-grant',
        pointer,
      }),
    ).toBe('sv-grant');
  });

  it('uses the shared or published pointer instead of the current draft', () => {
    expect(chooseAuthorizedVersionId({ canEdit: false, pointer })).toBe(
      'sv-shared',
    );
    expect(
      chooseAuthorizedVersionId({
        canEdit: false,
        pointer: {
          ...pointer,
          audience: 'public',
          publishedVersionId: 'sv-public',
          sharedVersionId: null,
        },
      }),
    ).toBe('sv-public');
  });

  it('honors an execution pin over a later activation pointer', () => {
    expect(
      chooseAuthorizedVersionId({
        assignmentVersionId: 'sv-activated',
        canEdit: false,
        pinnedVersionId: 'sv-first-run',
        pointer,
      }),
    ).toBe('sv-first-run');
  });

  it('lets an editor read the current draft only when nothing is published', () => {
    expect(
      chooseAuthorizedVersionId({
        canEdit: true,
        pointer: {
          ...pointer,
          audience: 'private',
          sharedVersionId: null,
        },
      }),
    ).toBe('sv-current');
  });

  it('reads the shared or published version instead of a different use-only grant', () => {
    expect(chooseReadableVersionId({ pointer })).toBe('sv-shared');
    expect(
      chooseReadableVersionId({
        pointer: {
          ...pointer,
          audience: 'public',
          publishedVersionId: 'sv-public',
          sharedVersionId: null,
        },
      }),
    ).toBe('sv-public');
    expect(
      chooseReadableVersionId({
        pointer,
        readGrantVersionId: 'sv-read-grant',
      }),
    ).toBe('sv-read-grant');
  });

  it('hides the current draft from a caller who only has a missing publication', () => {
    expect(
      chooseAuthorizedVersionId({
        canEdit: false,
        pointer: {
          audience: 'private',
          currentVersionId: 'sv-draft',
          ownerKind: 'user',
          publishedVersionId: null,
          sharedVersionId: null,
        },
      }),
    ).toBeNull();
  });
});
