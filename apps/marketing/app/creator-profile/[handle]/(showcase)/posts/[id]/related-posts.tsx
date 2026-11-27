import { ringNeighbors } from '@data/related-links.data';
import { creatorPostPath } from '@genfeedai/contracts/constants';
import {
  postTitle,
  toPlainPostText,
} from '@genfeedai/helpers/content/public-post.helper';
import type { Post } from '@models/content/post.model';
import { PublicService } from '@services/external/public.service';
import RelatedLinks from '@web-components/content/RelatedLinks';
import { cache } from 'react';

/** Posts per creator the related links walk through. */
const RELATED_POSTS_LIMIT = 100;

const DESCRIPTION_LENGTH = 120;

/** A creator's public posts, on every platform, in the API's order. A listing that fails reads as empty. */
const getCreatorPostList = cache(async (brandId: string): Promise<Post[]> => {
  try {
    return await PublicService.getInstance().findPublicPosts({
      brand: brandId,
      limit: RELATED_POSTS_LIMIT,
    });
  } catch {
    return [];
  }
});

interface RelatedPostsProps {
  brandId: string;
  handle: string;
  postId: string;
}

/**
 * The posts that follow this one in the creator's list, wrapping at the end,
 * so every post is linked from three others and not only from the profile
 * and the first page of the posts tab. Posts from every platform are listed:
 * the profile links to a page for each.
 */
export default async function RelatedPosts({
  brandId,
  handle,
  postId,
}: RelatedPostsProps): Promise<React.ReactElement | null> {
  const posts = await getCreatorPostList(brandId);
  const related = ringNeighbors(
    posts,
    posts.findIndex((post) => post.id === postId),
  );

  return (
    <RelatedLinks
      links={related.map((post) => {
        const text = toPlainPostText(post.description);
        return {
          description: text.slice(0, DESCRIPTION_LENGTH),
          href: creatorPostPath(handle, post.id),
          label: postTitle(post.label, text),
        };
      })}
      title={`More from @${handle}`}
    />
  );
}
