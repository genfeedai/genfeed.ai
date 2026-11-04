import { IngredientCategory, Platform } from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
  getPostMediaRequirement,
  isPostMediaRequirementMet,
  MAX_POST_MEDIA_ITEMS,
  mergePostMedia,
} from './post-media.helper';

function media(id: string, category: IngredientCategory): IIngredient {
  return { category, id } as IIngredient;
}

describe('getPostMediaRequirement', () => {
  it.each([
    [[], 'none'],
    [[Platform.TWITTER], 'none'],
    [[Platform.INSTAGRAM], 'media'],
    [[Platform.LINKEDIN], 'none'],
    [[Platform.THREADS, Platform.REDDIT, Platform.MASTODON], 'none'],
    [[Platform.TWITTER, Platform.FACEBOOK], 'media'],
    [[Platform.PINTEREST], 'media'],
    [[Platform.YOUTUBE], 'video'],
    [[Platform.INSTAGRAM, Platform.TIKTOK], 'video'],
  ])('%j needs %s', (platforms, expected) => {
    expect(getPostMediaRequirement(platforms)).toBe(expected);
  });
});

describe('isPostMediaRequirementMet', () => {
  const image = media('image-1', IngredientCategory.IMAGE);
  const video = media('video-1', IngredientCategory.VIDEO);

  it.each([
    ['none', [], true],
    ['media', [], false],
    ['media', [image], true],
    ['video', [image], false],
    ['video', [image, video], true],
  ] as const)('%s with %j is %s', (requirement, items, expected) => {
    expect(isPostMediaRequirementMet(requirement, items)).toBe(expected);
  });
});

describe('mergePostMedia', () => {
  it('appends new items in pick order and ignores repeats', () => {
    const first = media('a', IngredientCategory.IMAGE);
    const second = media('b', IngredientCategory.VIDEO);

    expect(
      mergePostMedia([first], [second, first]).map((item) => item.id),
    ).toEqual(['a', 'b']);
  });

  it('caps the attachment count', () => {
    const picked = Array.from({ length: MAX_POST_MEDIA_ITEMS + 3 }, (_, i) =>
      media(`item-${i}`, IngredientCategory.IMAGE),
    );

    expect(mergePostMedia([], picked)).toHaveLength(MAX_POST_MEDIA_ITEMS);
  });
});
