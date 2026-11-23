import type {
  IFacebookGraphConversation,
  IFacebookGraphPost,
  IFacebookMessengerThread,
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

/**
 * Messenger conversations of a Page as inbox threads. Only the person's
 * messages are kept: a message the Page sent is stored when Genfeed sends it,
 * and one typed in Meta's own inbox has no outbound row to attach to, so
 * reading either back would show the Page's words as the person's.
 */
export function toMessengerThreads(
  conversations: readonly IFacebookGraphConversation[],
  pageId: string,
): IFacebookMessengerThread[] {
  return conversations.flatMap((conversation) => {
    if (!conversation.id) {
      return [];
    }

    const participant = (conversation.participants?.data ?? []).find(
      (entry) => entry.id && entry.id !== pageId,
    );

    const messages = (conversation.messages?.data ?? []).flatMap((message) => {
      const createdAt = new Date(message.created_time ?? Number.NaN);
      const text = message.message?.trim();
      // An attachment-only message has no text the inbox can show.
      if (
        !message.id ||
        !text ||
        Number.isNaN(createdAt.getTime()) ||
        message.from?.id === pageId
      ) {
        return [];
      }

      return [
        {
          createdAt,
          messageId: message.id,
          senderExternalId: message.from?.id,
          senderName: message.from?.name,
          text,
        },
      ];
    });

    return [
      {
        conversationId: conversation.id,
        messages,
        participantExternalId: participant?.id,
        participantName: participant?.name,
      },
    ];
  });
}
