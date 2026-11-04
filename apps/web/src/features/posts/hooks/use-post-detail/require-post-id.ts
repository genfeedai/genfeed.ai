import type { IPost } from '@genfeedai/contracts/interfaces';

export function requirePostId(post: IPost): string {
  if (typeof post.id !== 'string' || post.id.length === 0) {
    throw new Error('Post is missing an id');
  }
  return post.id;
}
