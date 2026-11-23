import type {
  IThreadsGraphPost,
  IThreadsReply,
} from '@genfeedai/contracts/interfaces/integrations/threads.interface';

const POST_TITLE_LIMIT = 120;

/**
 * Flatten the connected account's posts, each with the replies read from it,
 * into inbox replies. A nested reply belongs to the thread of the reply that
 * answers the post directly, so a whole exchange stays one conversation. A
 * reply the account wrote itself is flagged so it is not stored as inbound.
 */
export function toThreadsReplies(
  posts: readonly IThreadsGraphPost[],
): IThreadsReply[] {
  return posts.flatMap((post) => {
    const parentById = new Map(
      post.replies.map((reply) => [reply.id, reply.replied_to?.id]),
    );

    const threadIdOf = (replyId: string): string => {
      let current = replyId;
      // A cycle cannot come from Threads, but a bound keeps a bad payload from
      // holding the sync open.
      for (let hops = 0; hops < post.replies.length; hops++) {
        const parentId = parentById.get(current);
        if (!parentId || !parentById.has(parentId)) {
          return current;
        }
        current = parentId;
      }
      return current;
    };

    return post.replies.flatMap((reply) => {
      const createdAt = new Date(reply.timestamp ?? Number.NaN);
      const text = reply.text?.trim();
      // A media-only or removed reply has no text the inbox can show.
      if (!text || Number.isNaN(createdAt.getTime())) {
        return [];
      }

      return [
        {
          authorHandle: reply.username,
          createdAt,
          isOwn: reply.is_reply_owned_by_me === true,
          parentId: reply.replied_to?.id,
          permalink: reply.permalink,
          postId: post.id,
          postTitle: post.text?.slice(0, POST_TITLE_LIMIT),
          postUrl: post.permalink,
          replyId: reply.id,
          text,
          threadId: threadIdOf(reply.id),
        },
      ];
    });
  });
}
