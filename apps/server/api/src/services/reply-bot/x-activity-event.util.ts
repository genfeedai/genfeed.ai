/**
 * Normalize X Activity (XAA) / Account Activity (AAA) payloads into inbound candidates.
 * Connect-later: shapes are tolerant of both generations of event JSON.
 */

export type XActivityInboundCandidate = {
  commentAuthorId?: string;
  commentAuthorUsername: string;
  commentId: string;
  commentText: string;
  /** X user id the subscription is for (brand account). */
  forUserId?: string;
  parentPostId: string;
};

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as LooseRecord;
  }
  return null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Extract reply-like posts from a webhook body.
 * Supports AAA `tweet_create_events` and XAA-style `post.create` / nested data.
 */
export function extractInboundCandidatesFromXActivityPayload(
  payload: unknown,
): XActivityInboundCandidate[] {
  const root = asRecord(payload);
  if (!root) {
    return [];
  }

  const forUserId = asString(root.for_user_id) ?? asString(root.forUserId);
  const candidates: XActivityInboundCandidate[] = [];

  // AAA: tweet_create_events[]
  const tweetEvents = root.tweet_create_events;
  if (Array.isArray(tweetEvents)) {
    for (const event of tweetEvents) {
      const candidate = mapTweetLikeObject(event, forUserId);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  // XAA / generic: events[] or data[]
  const events = root.events ?? root.data;
  if (Array.isArray(events)) {
    for (const event of events) {
      const record = asRecord(event);
      if (!record) {
        continue;
      }
      const type = asString(record.event_type) ?? asString(record.type) ?? '';
      if (
        type &&
        !type.includes('create') &&
        !type.includes('mention') &&
        type !== 'tweet_create_events'
      ) {
        // Skip obvious non-create activity when typed
        if (type.includes('delete') || type.includes('follow')) {
          continue;
        }
      }
      const post =
        asRecord(record.post) ??
        asRecord(record.data) ??
        asRecord(record.tweet) ??
        record;
      const candidate = mapTweetLikeObject(post, forUserId);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  // Single post body
  if (candidates.length === 0) {
    const single = mapTweetLikeObject(root, forUserId);
    if (single) {
      candidates.push(single);
    }
  }

  return candidates;
}

function mapTweetLikeObject(
  value: unknown,
  forUserId?: string,
): XActivityInboundCandidate | null {
  const tweet = asRecord(value);
  if (!tweet) {
    return null;
  }

  const id = asString(tweet.id) ?? asString(tweet.id_str);
  const text =
    asString(tweet.text) ??
    asString(tweet.full_text) ??
    asString(asRecord(tweet.extended_tweet)?.full_text);
  if (!id || !text) {
    return null;
  }

  // Parent: replied_to id, in_reply_to_status_id, conversation_id
  const referenced = tweet.referenced_tweets;
  let parentPostId: string | undefined;
  if (Array.isArray(referenced)) {
    const replied = referenced.find((ref) => {
      const row = asRecord(ref);
      return row && asString(row.type) === 'replied_to';
    });
    parentPostId = asString(asRecord(replied)?.id);
  }
  parentPostId =
    parentPostId ??
    asString(tweet.in_reply_to_status_id_str) ??
    asString(tweet.in_reply_to_status_id) ??
    asString(tweet.conversation_id);

  // Skip root posts with no reply parent (not a comment on our post)
  if (!parentPostId || parentPostId === id) {
    return null;
  }

  const user = asRecord(tweet.user) ?? asRecord(tweet.author);
  const authorId =
    asString(tweet.author_id) ?? asString(user?.id_str) ?? asString(user?.id);
  const authorUsername =
    asString(user?.screen_name) ??
    asString(user?.username) ??
    asString(tweet.author_username) ??
    'unknown';

  // Skip activity created by the subscribed user themselves when possible
  if (forUserId && authorId && authorId === forUserId) {
    return null;
  }

  return {
    commentAuthorId: authorId,
    commentAuthorUsername: authorUsername,
    commentId: id,
    commentText: text,
    forUserId,
    parentPostId,
  };
}
