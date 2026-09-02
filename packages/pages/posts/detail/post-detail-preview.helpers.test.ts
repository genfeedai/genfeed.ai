import {
  IngredientCategory,
  IngredientStatus,
  Platform,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/enums';
import type { ICredential, IIngredient, IPost } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';

import { buildPostTargetPreview } from './post-detail-preview.helpers';

function makeIngredient(overrides: Partial<IIngredient> = {}): IIngredient {
  return {
    category: IngredientCategory.IMAGE,
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'ingredient-1',
    isDeleted: false,
    organization: 'org-1',
    status: IngredientStatus.COMPLETED,
    updatedAt: '2026-01-01T00:00:00.000Z',
    user: 'user-1',
    ...overrides,
  } as IIngredient;
}

function makePost(overrides: Partial<IPost> = {}): IPost {
  return {
    category: PostCategory.SOCIAL,
    createdAt: '2026-01-01T00:00:00.000Z',
    description: '<p>Hello <strong>world</strong></p>',
    id: 'post-1',
    ingredients: [],
    isDeleted: false,
    label: 'My post',
    organization: 'org-1',
    platform: Platform.TWITTER,
    publicationDate: '2026-01-01T00:00:00.000Z',
    status: 'draft',
    targetExecutionState: TargetExecutionState.DRAFT,
    updatedAt: '2026-01-01T00:00:00.000Z',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    user: 'user-1',
    ...overrides,
  } as IPost;
}

describe('buildPostTargetPreview', () => {
  it('returns null when the post has no resolved platform', () => {
    expect(
      buildPostTargetPreview(makePost({ platform: undefined }), '', undefined),
    ).toBeNull();
  });

  it('prefers the live description draft over the persisted description', () => {
    const preview = buildPostTargetPreview(
      makePost(),
      '<p>Draft caption</p>',
      undefined,
    );

    expect(preview?.release.baseContent).toBe('Draft caption');
    expect(preview?.target.settings.caption).toBe('Draft caption');
  });

  it('strips HTML from the persisted description when no draft is present', () => {
    const preview = buildPostTargetPreview(makePost(), '', undefined);

    expect(preview?.release.baseContent).toBe('Hello world');
  });

  it('maps ingredients with a resolvable URL onto release media', () => {
    const preview = buildPostTargetPreview(
      makePost({
        ingredients: [
          makeIngredient({ cdnUrl: 'https://cdn.example.com/a.png' }),
          makeIngredient({
            category: IngredientCategory.VIDEO,
            id: 'ingredient-2',
            ingredientUrl: 'https://cdn.example.com/b.mp4',
          }),
          makeIngredient({ id: 'ingredient-3' }),
        ],
      }),
      '',
      undefined,
    );

    expect(preview?.release.media).toEqual([
      {
        assetId: 'ingredient-1',
        kind: 'image',
        order: 0,
        url: 'https://cdn.example.com/a.png',
      },
      {
        assetId: 'ingredient-2',
        kind: 'video',
        order: 1,
        url: 'https://cdn.example.com/b.mp4',
      },
    ]);
  });

  it('uses the post credential when present, falling back to a bare platform credential', () => {
    const credential = {
      externalHandle: 'genfeed',
      externalName: 'Genfeed',
      platform: Platform.TWITTER,
    } as ICredential;

    const withCredential = buildPostTargetPreview(makePost(), '', credential);
    expect(withCredential?.credential).toBe(credential);

    const withoutCredential = buildPostTargetPreview(makePost(), '', undefined);
    expect(withoutCredential?.credential.platform).toBe(Platform.TWITTER);
  });
});
