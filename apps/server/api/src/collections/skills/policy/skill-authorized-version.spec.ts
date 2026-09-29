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

  it('reads a system catalog current version only when that source policy allows it', () => {
    const systemPointer = {
      audience: 'private',
      currentVersionId: 'sv-system',
      ownerKind: 'system',
      publishedVersionId: null,
      sharedVersionId: null,
    };
    expect(
      chooseReadableVersionId({
        allowsCatalogRead: true,
        pointer: systemPointer,
      }),
    ).toBe('sv-system');
    expect(
      chooseReadableVersionId({
        allowsCatalogRead: false,
        pointer: systemPointer,
      }),
    ).toBeNull();
    expect(
      chooseReadableVersionId({
        allowsCatalogRead: true,
        pointer: { ...systemPointer, ownerKind: 'organization' },
      }),
    ).toBeNull();
    expect(
      chooseReadableVersionId({
        allowsCatalogRead: true,
        pointer: { ...systemPointer, ownerKind: 'user' },
      }),
    ).toBeNull();
    expect(
      chooseReadableVersionId({
        allowsCatalogRead: true,
        pointer: systemPointer,
        readGrantVersionId: 'sv-read-grant',
      }),
    ).toBe('sv-read-grant');
  });

  it('reads the captured system catalog version and not another owner draft', () => {
    const systemCatalog = {
      audience: 'private',
      currentVersionId: 'sv-catalog',
      ownerKind: 'system',
      publishedVersionId: null,
      sharedVersionId: null,
    };

    expect(
      chooseReadableVersionId({
        allowsCatalogRead: true,
        pointer: systemCatalog,
      }),
    ).toBe('sv-catalog');
    expect(
      chooseReadableVersionId({
        allowsCatalogRead: true,
        pointer: { ...systemCatalog, ownerKind: 'organization' },
      }),
    ).toBeNull();
    expect(
      chooseReadableVersionId({
        allowsCatalogRead: true,
        pointer: { ...systemCatalog, ownerKind: 'user' },
      }),
    ).toBeNull();
    expect(
      chooseReadableVersionId({
        allowsCatalogRead: true,
        pointer: systemCatalog,
        readGrantVersionId: 'sv-read-grant',
      }),
    ).toBe('sv-read-grant');
  });
});
