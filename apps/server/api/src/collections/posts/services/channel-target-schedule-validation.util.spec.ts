import { correctedCategoryForLinkedMedia } from '@api/collections/posts/services/channel-target-schedule-validation.util';
import { IngredientCategory, PostCategory } from '@genfeedai/contracts';

describe('correctedCategoryForLinkedMedia', () => {
  it('corrects a legacy TEXT target whose linked media is a video', () => {
    expect(
      correctedCategoryForLinkedMedia(PostCategory.TEXT, [
        IngredientCategory.VIDEO,
      ]),
    ).toBe(PostCategory.VIDEO);
  });

  it('corrects an IMAGE target whose linked media is now a video', () => {
    expect(
      correctedCategoryForLinkedMedia(PostCategory.IMAGE, [
        IngredientCategory.VIDEO,
      ]),
    ).toBe(PostCategory.VIDEO);
  });

  it('leaves a category that already describes the linked media alone', () => {
    expect(
      correctedCategoryForLinkedMedia(PostCategory.VIDEO, [
        IngredientCategory.VIDEO_EDIT,
      ]),
    ).toBeUndefined();
    expect(
      correctedCategoryForLinkedMedia(PostCategory.IMAGE, [
        IngredientCategory.GIF,
      ]),
    ).toBeUndefined();
  });

  it('keeps format-specific REEL and STORY categories the media still fits', () => {
    expect(
      correctedCategoryForLinkedMedia(PostCategory.REEL, [
        IngredientCategory.VIDEO,
      ]),
    ).toBeUndefined();
    expect(
      correctedCategoryForLinkedMedia(PostCategory.STORY, [
        IngredientCategory.VIDEO,
      ]),
    ).toBeUndefined();
  });

  it('never overrides the category from ingredients that prove no visual kind', () => {
    expect(
      correctedCategoryForLinkedMedia(PostCategory.VIDEO, [
        IngredientCategory.AVATAR,
      ]),
    ).toBeUndefined();
    expect(correctedCategoryForLinkedMedia(PostCategory.IMAGE, [])).toBe(
      undefined,
    );
  });
});
