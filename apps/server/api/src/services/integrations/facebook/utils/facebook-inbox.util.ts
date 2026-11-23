import type {
  IFacebookGraphPost,
  IFacebookPageComment,
} from '@genfeedai/contracts/interfaces/integrations/facebook.interface';

const POST_TITLE_LIMIT = 120;

/**
 * Flatten a Page's posts, each with its expanded comments, into inbox
 * comments. A reply belongs to the thread of the top-level comment it hangs
 * under; a comment the Page itself wrote is flagged so it is not stored as an
 * inbound message.
 */
export function toPageComments(
  posts: readonly IFacebookGraphPost[],
  pageId: string,
): IFacebookPageComment[] {
  return posts.flatMap((post) =>
    (post.comments?.data ?? []).flatMap((comment) => {
      const createdAt = new Date(comment.created_time ?? Number.NaN);
      const text = comment.message?.trim();
      // A photo-only or deleted comment has no text the inbox can show.
      if (!text || Number.isNaN(createdAt.getTime())) {
        return [];
      }

      return [
        {
          authorExternalId: comment.from?.id,
          authorName: comment.from?.name,
          commentId: comment.id,
          createdAt,
          isFromPage: comment.from?.id === pageId,
          postId: post.id,
          postTitle: post.message?.slice(0, POST_TITLE_LIMIT),
          postUrl: post.permalink_url,
          text,
          threadId: comment.parent?.id ?? comment.id,
        },
      ];
    }),
  );
}
