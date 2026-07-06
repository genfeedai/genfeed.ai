import { ContentType, PostCategory } from '@genfeedai/enums';

const CONTENT_TYPE_BY_POST_CATEGORY = {
  [PostCategory.ARTICLE]: ContentType.ARTICLE,
  [PostCategory.IMAGE]: ContentType.IMAGE,
  [PostCategory.POST]: ContentType.CAPTION,
  [PostCategory.REEL]: ContentType.VIDEO,
  [PostCategory.STORY]: ContentType.IMAGE,
  [PostCategory.TEXT]: ContentType.CAPTION,
  [PostCategory.VIDEO]: ContentType.VIDEO,
} satisfies Partial<Record<PostCategory, ContentType>>;

const isMappedPostCategory = (
  category: string,
): category is keyof typeof CONTENT_TYPE_BY_POST_CATEGORY =>
  category in CONTENT_TYPE_BY_POST_CATEGORY;

export function mapPostCategoryToContentType(
  category?: string | null,
): ContentType {
  if (!category) {
    return ContentType.CAPTION;
  }

  return isMappedPostCategory(category)
    ? CONTENT_TYPE_BY_POST_CATEGORY[category]
    : ContentType.CAPTION;
}
