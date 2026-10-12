import { TweetTone } from '@api/collections/posts/dto/generate-tweets.dto';
import { isValidPostLength } from '@api/collections/posts/services/post-generation-text.util';
import { readOptionalString } from '@api/services/agent-orchestrator/tools/agent-tool-parameter-readers';
import { CredentialPlatform } from '@genfeedai/contracts';

export const X_REPLY_MAX_WEIGHTED_CHARACTERS = 280;
export const THREAD_REPLY_LABEL = 'Thread reply';
export const GROK_FEEDBACK_LABEL = 'Grok feedback request';
export const FIRST_COMMENT_LABEL = 'First comment';
export const MAX_THREAD_REPLIES_PER_CALL = 10;

const GROK_MENTION = '@grok';
const MAX_FIRST_COMMENT_LENGTH = 2000;

/** Same platforms the post composer offers a first comment for. */
const FIRST_COMMENT_PLATFORMS: ReadonlySet<string> = new Set([
  CredentialPlatform.YOUTUBE,
  CredentialPlatform.INSTAGRAM,
  CredentialPlatform.LINKEDIN,
  CredentialPlatform.FACEBOOK,
  CredentialPlatform.REDDIT,
]);

export type ThreadToolInputError = { error: string };

export type DraftThreadInput = {
  count: number;
  postId: string;
  tone?: TweetTone;
};

export type AddThreadPostsInput = {
  grokQuestion?: string;
  postId: string;
  posts: string[];
};

export type AddFirstCommentInput = {
  comment: string;
  postId: string;
};

export type ThreadChild = {
  description?: string | null;
  id: string;
  order?: number | null;
};

export type ThreadReplyPlan = {
  alreadySaved: string[];
  /** Order of the first new reply; the closing @grok post follows the last one. */
  firstOrder: number;
  /** Existing closing @grok post, which must stay last. */
  grokChild: ThreadChild | null;
  /** New closing @grok text to save, when it differs from what is stored. */
  grokDescription?: string;
  toCreate: Array<{ description: string; order: number }>;
};

export function isClosingGrokPost(
  description: string | null | undefined,
): boolean {
  return description?.trim().startsWith(GROK_MENTION) ?? false;
}

export function supportsFirstComment(platform: unknown): boolean {
  return typeof platform === 'string'
    ? FIRST_COMMENT_PLATFORMS.has(platform.trim().toLowerCase())
    : false;
}

function readPostId(params: Record<string, unknown>): string | undefined {
  return readOptionalString(params.postId);
}

function fitsXPost(text: string): boolean {
  return isValidPostLength(text, X_REPLY_MAX_WEIGHTED_CHARACTERS, true);
}

export function parseDraftThreadInput(
  params: Record<string, unknown>,
): DraftThreadInput | ThreadToolInputError {
  const postId = readPostId(params);
  if (!postId) return { error: 'postId is required.' };

  const { count } = params;
  if (typeof count !== 'number' || !Number.isInteger(count)) {
    return { error: 'count must be a whole number from 2 to 5.' };
  }
  if (count < 2 || count > 5) {
    return {
      error: 'count must be from 2 to 5 posts, including the original.',
    };
  }

  const tone = readOptionalString(params.tone);
  if (tone === undefined) return { count, postId };
  const knownTone = Object.values(TweetTone).find((value) => value === tone);
  if (!knownTone) {
    return {
      error: `tone must be one of: ${Object.values(TweetTone).join(', ')}.`,
    };
  }
  return { count, postId, tone: knownTone };
}

function normalizeGrokQuestion(question: string): string {
  return isClosingGrokPost(question) ? question : `${GROK_MENTION} ${question}`;
}

export function parseAddThreadPostsInput(
  params: Record<string, unknown>,
): AddThreadPostsInput | ThreadToolInputError {
  const postId = readPostId(params);
  if (!postId) return { error: 'postId is required.' };

  const { posts: rawPosts } = params;
  if (!Array.isArray(rawPosts) || rawPosts.length === 0) {
    return { error: 'posts must list at least one reply to save.' };
  }
  if (rawPosts.length > MAX_THREAD_REPLIES_PER_CALL) {
    return {
      error: `posts can save at most ${MAX_THREAD_REPLIES_PER_CALL} replies per call.`,
    };
  }

  const posts: string[] = [];
  for (const [index, raw] of rawPosts.entries()) {
    const text = readOptionalString(raw);
    if (!text) return { error: `posts[${index}] must be non-empty text.` };
    if (isClosingGrokPost(text)) {
      return {
        error: `posts[${index}] starts with @grok. Pass the closing question as grokQuestion.`,
      };
    }
    if (!fitsXPost(text)) {
      return {
        error: `posts[${index}] is over ${X_REPLY_MAX_WEIGHTED_CHARACTERS} weighted characters.`,
      };
    }
    posts.push(text);
  }

  const question = readOptionalString(params.grokQuestion);
  if (question === undefined) return { postId, posts };
  const grokQuestion = normalizeGrokQuestion(question);
  if (!fitsXPost(grokQuestion)) {
    return {
      error: `grokQuestion is over ${X_REPLY_MAX_WEIGHTED_CHARACTERS} weighted characters.`,
    };
  }
  return { grokQuestion, postId, posts };
}

export function parseAddFirstCommentInput(
  params: Record<string, unknown>,
): AddFirstCommentInput | ThreadToolInputError {
  const postId = readPostId(params);
  if (!postId) return { error: 'postId is required.' };
  const comment = readOptionalString(params.comment);
  if (!comment) return { error: 'comment must be non-empty text.' };
  if (comment.length > MAX_FIRST_COMMENT_LENGTH) {
    return {
      error: `comment is over ${MAX_FIRST_COMMENT_LENGTH} characters.`,
    };
  }
  return { comment, postId };
}

/**
 * Decides where accepted replies go, mirroring the composer's
 * `handleAddThreadPosts`: replies land before a closing @grok post, which is
 * bumped to stay last. A reply whose text is already saved under the parent is
 * skipped, so a retry after a partial failure never duplicates it.
 */
export function planThreadReplies(
  children: readonly ThreadChild[],
  posts: readonly string[],
  grokQuestion?: string,
): ThreadReplyPlan {
  const sorted = [...children].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const last = sorted.at(-1) ?? null;
  const grokChild = last && isClosingGrokPost(last.description) ? last : null;

  const savedTexts = new Map<string, number>();
  for (const child of sorted) {
    if (child === grokChild) continue;
    const text = child.description?.trim() ?? '';
    savedTexts.set(text, (savedTexts.get(text) ?? 0) + 1);
  }

  const alreadySaved: string[] = [];
  const pending: string[] = [];
  for (const post of posts) {
    const count = savedTexts.get(post) ?? 0;
    if (count > 0) {
      savedTexts.set(post, count - 1);
      alreadySaved.push(post);
    } else {
      pending.push(post);
    }
  }

  const firstOrder = grokChild
    ? grokChild.order || sorted.length
    : sorted.length + 1;
  const grokDescription =
    grokQuestion !== undefined &&
    grokQuestion !== (grokChild?.description?.trim() ?? undefined)
      ? grokQuestion
      : undefined;

  return {
    alreadySaved,
    firstOrder,
    grokChild,
    ...(grokDescription !== undefined ? { grokDescription } : {}),
    toCreate: pending.map((description, offset) => ({
      description,
      order: firstOrder + offset,
    })),
  };
}
