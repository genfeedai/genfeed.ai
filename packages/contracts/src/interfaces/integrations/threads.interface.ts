/** One reply on a post of a connected Threads account. */
export interface IThreadsReply {
  authorHandle?: string;
  createdAt: Date;
  /** The connected account wrote this reply, so it is an outbound message. */
  isOwn: boolean;
  /** The post or reply this one answers: the id a reply to it is sent to. */
  parentId?: string;
  permalink?: string;
  postId: string;
  postTitle?: string;
  postUrl?: string;
  replyId: string;
  text: string;
  /** The reply to the post this one belongs to (its own id when top-level). */
  threadId: string;
}

/** A reply node as the Threads `conversation` edge returns it. */
export interface IThreadsGraphReply {
  id: string;
  is_reply_owned_by_me?: boolean;
  permalink?: string;
  replied_to?: { id?: string };
  text?: string;
  timestamp?: string;
  username?: string;
}

/** A post of the connected account with the replies read from it. */
export interface IThreadsGraphPost {
  id: string;
  permalink?: string;
  replies: IThreadsGraphReply[];
  text?: string;
}
