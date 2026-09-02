import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { TwitterApi } from 'twitter-api-v2';

export type TwitterInboxTweet = {
  authorAvatarUrl?: string;
  authorId?: string;
  authorName?: string;
  authorUsername?: string;
  conversationId: string;
  createdAt: Date;
  inReplyToId: string | null;
  text: string;
  tweetId: string;
};

export type TwitterInboxDmMessage = {
  createdAt: Date;
  messageId: string;
  senderId?: string;
  senderName?: string;
  senderUsername?: string;
  text: string;
};

export type TwitterInboxDmThread = {
  conversationId: string;
  messages: TwitterInboxDmMessage[];
  participantExternalId?: string;
  participantName?: string;
  participantUsername?: string;
};

export type TwitterDirectMessageListing = {
  nextToken?: string;
  threads: TwitterInboxDmThread[];
};

type TwitterUserInclude = {
  id: string;
  name?: string;
  profile_image_url?: string;
  username?: string;
};

type TwitterMentionsResponse = {
  data?: Array<{
    author_id?: string;
    conversation_id?: string;
    created_at?: string;
    id: string;
    referenced_tweets?: Array<{ id: string; type: string }>;
    text?: string;
  }>;
  includes?: { users?: TwitterUserInclude[] };
};

type TwitterDmEventsResponse = {
  data?: Array<{
    created_at?: string;
    dm_conversation_id?: string;
    event_type?: string;
    id?: string;
    sender_id?: string;
    text?: string;
  }>;
  includes?: { users?: TwitterUserInclude[] };
  meta?: { next_token?: string; result_count?: number };
};

type TwitterReply = {
  authorId?: string;
  authorName?: string;
  authorUsername?: string;
  createdAt?: Date;
  id: string;
  inReplyToId: string | null;
  text: string;
};

type ResolveTwitterCredential = (
  organizationId: string,
  brandId: string,
  credentialId?: string,
) => Promise<{ accessToken?: string | null; externalId?: string | null }>;

type GetTweetReplies = (
  tweetId: string,
  options: { accessToken: string; maxResults?: number; sinceId?: string },
) => Promise<TwitterReply[]>;

function requireString(
  value: string | null | undefined,
  field: string,
): string {
  if (!value) {
    throw new Error(`Twitter credential is missing ${field}`);
  }
  return value;
}

function toGraphDate(value?: string): Date {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function toInboxTweets(
  result: TwitterMentionsResponse,
  accountId: string,
): TwitterInboxTweet[] {
  const usersById = new Map(
    (result.includes?.users ?? []).map((user) => [user.id, user]),
  );

  return (result.data ?? []).flatMap((tweet) => {
    if (!tweet.id || !tweet.text || tweet.author_id === accountId) {
      return [];
    }
    const author = usersById.get(tweet.author_id ?? '');
    const repliedTo = tweet.referenced_tweets?.find(
      (reference) => reference.type === 'replied_to',
    );
    return [
      {
        authorAvatarUrl: author?.profile_image_url,
        authorId: tweet.author_id,
        authorName: author?.name,
        authorUsername: author?.username,
        conversationId: tweet.conversation_id ?? tweet.id,
        createdAt: toGraphDate(tweet.created_at),
        inReplyToId: repliedTo?.id ?? null,
        text: tweet.text,
        tweetId: tweet.id,
      },
    ];
  });
}

function toInboxDmThreads(
  result: TwitterDmEventsResponse,
  accountId: string,
): TwitterInboxDmThread[] {
  const usersById = new Map(
    (result.includes?.users ?? []).map((user) => [user.id, user]),
  );
  const threads = new Map<string, TwitterInboxDmThread>();

  for (const event of result.data ?? []) {
    if (
      !event.id ||
      !event.dm_conversation_id ||
      !event.text ||
      event.sender_id === accountId
    ) {
      continue;
    }
    const sender = usersById.get(event.sender_id ?? '');
    const message: TwitterInboxDmMessage = {
      createdAt: toGraphDate(event.created_at),
      messageId: event.id,
      senderId: event.sender_id,
      senderName: sender?.name,
      senderUsername: sender?.username,
      text: event.text,
    };
    const existing = threads.get(event.dm_conversation_id);
    if (existing) {
      existing.messages.push(message);
    } else {
      threads.set(event.dm_conversation_id, {
        conversationId: event.dm_conversation_id,
        messages: [message],
        participantExternalId: event.sender_id,
        participantName: sender?.name,
        participantUsername: sender?.username,
      });
    }
  }

  return [...threads.values()];
}

export class TwitterInboxService {
  constructor(
    private readonly loggerService: LoggerService,
    private readonly resolveCredential: ResolveTwitterCredential,
    private readonly getTweetReplies: GetTweetReplies,
  ) {}

  async listMentions(
    organizationId: string,
    brandId: string,
    options: { limit?: number; sinceId?: string } = {},
    credentialId?: string,
  ): Promise<TwitterInboxTweet[]> {
    const caller = `TwitterService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const accessToken = EncryptionUtil.decrypt(
      requireString(credential.accessToken, 'accessToken'),
    );
    const userId = requireString(credential.externalId, 'externalId');
    const client = new TwitterApi(accessToken);

    try {
      const params: Record<string, string | number> = {
        expansions: 'author_id',
        max_results: Math.min(Math.max(options.limit ?? 25, 5), 100),
        'tweet.fields':
          'author_id,created_at,conversation_id,referenced_tweets,in_reply_to_user_id',
        'user.fields': 'username,name,profile_image_url',
      };
      if (options.sinceId) {
        params.since_id = options.sinceId;
      }
      const response = (await client.v2.get(
        `users/${userId}/mentions`,
        params,
      )) as TwitterMentionsResponse;
      const tweets = toInboxTweets(response, userId);
      this.loggerService.log(`${caller} found ${tweets.length} mentions`, {
        sinceId: options.sinceId,
        userId,
      });
      return tweets;
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async listPostReplies(
    organizationId: string,
    brandId: string,
    tweetId: string,
    options: { limit?: number; sinceId?: string } = {},
    credentialId?: string,
  ): Promise<TwitterInboxTweet[]> {
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const accessToken = EncryptionUtil.decrypt(
      requireString(credential.accessToken, 'accessToken'),
    );
    const accountId = requireString(credential.externalId, 'externalId');
    const replies = await this.getTweetReplies(tweetId, {
      accessToken,
      maxResults: options.limit,
      sinceId: options.sinceId,
    });

    return replies.flatMap((reply) =>
      reply.authorId === accountId
        ? []
        : [
            {
              authorId: reply.authorId,
              authorName: reply.authorName,
              authorUsername: reply.authorUsername,
              conversationId: tweetId,
              createdAt: reply.createdAt ?? new Date(),
              inReplyToId: reply.inReplyToId,
              text: reply.text,
              tweetId: reply.id,
            } satisfies TwitterInboxTweet,
          ],
    );
  }

  async listDirectMessages(
    organizationId: string,
    brandId: string,
    options: { limit?: number; paginationToken?: string } = {},
    credentialId?: string,
  ): Promise<TwitterDirectMessageListing> {
    const caller = `TwitterService ${CallerUtil.getCallerName()}`;
    const credential = await this.resolveCredential(
      organizationId,
      brandId,
      credentialId,
    );
    const accessToken = EncryptionUtil.decrypt(
      requireString(credential.accessToken, 'accessToken'),
    );
    const accountId = requireString(credential.externalId, 'externalId');
    const client = new TwitterApi(accessToken);

    try {
      const params: Record<string, string | number> = {
        'dm_event.fields':
          'id,text,event_type,dm_conversation_id,sender_id,created_at',
        event_types: 'MessageCreate',
        expansions: 'sender_id',
        max_results: Math.min(Math.max(options.limit ?? 25, 1), 100),
        'user.fields': 'username,name',
      };
      if (options.paginationToken) {
        params.pagination_token = options.paginationToken;
      }
      const response = (await client.v2.get(
        'dm_events',
        params,
      )) as TwitterDmEventsResponse;
      const threads = toInboxDmThreads(response, accountId);
      const nextToken = response.meta?.next_token;
      this.loggerService.log(`${caller} found ${threads.length} DM threads`, {
        accountId,
        paginationToken: options.paginationToken,
      });
      return nextToken ? { nextToken, threads } : { threads };
    } catch (error: unknown) {
      this.loggerService.error(`${caller} failed`, error);
      throw error;
    }
  }

  async sendCommentReplyDm(
    organizationId: string,
    brandId: string,
    recipientId: string,
    message: string,
    credentialId?: string,
  ): Promise<void> {
    const url = `TwitterService ${CallerUtil.getCallerName()}`;

    try {
      const credential = await this.resolveCredential(
        organizationId,
        brandId,
        credentialId,
      );
      const accessToken = EncryptionUtil.decrypt(
        requireString(credential.accessToken, 'accessToken'),
      );
      await new TwitterApi(accessToken).v2.sendDmInConversation(recipientId, {
        text: message,
      });
      this.loggerService.log(`${url} success`, { recipientId });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
