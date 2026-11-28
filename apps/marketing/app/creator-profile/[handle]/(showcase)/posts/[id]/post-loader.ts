import type { Post } from '@models/content/post.model';
import { PublicService } from '@services/external/public.service';
import { cache } from 'react';
import { getPublicBrandBySlug } from '../../creator-loader';

/** The brand and the post, or `null` when either is not public. */
export const getCreatorPost = cache(async (handle: string, id: string) => {
  const brand = await getPublicBrandBySlug(handle);
  if (!brand) {
    return null;
  }
  const post: Post | null = await PublicService.getInstance().getPublicPost(
    id,
    brand.id,
  );
  if (!post || post.id === 'undefined') {
    return null;
  }
  return { brand, handle: brand.slug || handle, post };
});
