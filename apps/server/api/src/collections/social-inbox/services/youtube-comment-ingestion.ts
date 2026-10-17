import type {
  SocialConversationDocument,
  SocialMessageDocument,
} from '@api/collections/social-inbox/schemas/social-inbox.schema';
import { boundLimit } from '@api/collections/social-inbox/services/social-inbox.helpers';
import type {
  InboundSocialMessageInput,
  SocialInboxScope,
  YoutubeCommentIngestResult,
  YoutubeInboxPostFailure,
} from '@api/collections/social-inbox/services/social-inbox.types';
import { Platform, SocialConversationType } from '@genfeedai/contracts';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';

const YOUTUBE_POST_FAILURE_MESSAGE_LIMIT = 240;
const REDACTED_DIAGNOSIS = '[redacted]';

type YoutubeInboxCredential = {
  brandId: string | null;
  externalHandle: string | null;
  externalId: string | null;
  externalName: string | null;
  id: string;
  label: string | null;
  userId: string | null;
  username: string | null;
};

type OwnedYoutubePost = {
  brandId: string;
  description: string;
  externalId: string | null;
  id: string;
  label: string | null;
  url: string | null;
};

type YoutubeListedComment = {
  authorAvatarUrl?: string;
  authorChannelId?: string;
  authorChannelUrl?: string;
  authorDisplayName?: string;
  commentId: string;
  createdAt: Date;
  text: string;
  threadId: string;
};

export type ExistingSocialExternalIds = {
  conversationIds: Set<string>;
  conversationsByExternalId: Map<string, SocialConversationDocument>;
  messageIds: Set<string>;
  messagesByExternalId: Map<string, SocialMessageDocument>;
};

export type OwnedYoutubeCommentIngestPorts = {
  accountFields: (
    credential: YoutubeInboxCredential,
  ) => Pick<
    InboundSocialMessageInput,
    'accountExternalId' | 'accountHandle' | 'accountName' | 'userId'
  >;
  findConnectedCredentials: (
    scope: SocialInboxScope,
    credentialId?: string,
  ) => Promise<YoutubeInboxCredential[]>;
  findExistingExternalIds: (
    organizationId: string,
    threadIds: string[],
    commentIds: string[],
  ) => Promise<ExistingSocialExternalIds>;
  findOwnedPosts: (
    organizationId: string,
    credential: Pick<YoutubeInboxCredential, 'id' | 'brandId'>,
  ) => Promise<OwnedYoutubePost[]>;
  ingestSyncedMessage: (
    input: InboundSocialMessageInput,
    knownMessage: SocialMessageDocument | undefined,
    knownConversation: SocialConversationDocument | undefined,
  ) => Promise<string>;
  listVideoComments: (
    organizationId: string,
    brandId: string,
    videoId: string,
    limit: number,
    credentialId: string,
  ) => Promise<YoutubeListedComment[]>;
  warn: (
    message: string,
    context: { errorName: string; postFailureCount: number },
  ) => void;
};

const CREDENTIAL_FAILURE_REASONS = new Set([
  'authError',
  'dailyLimitExceeded',
  'invalid_grant',
  'quotaExceeded',
  'rateLimitExceeded',
  'userRateLimitExceeded',
]);

type YoutubeApiErrorShape = {
  code?: unknown;
  errors?: Array<{ reason?: unknown }>;
  message?: unknown;
  response?: {
    data?: { error?: { errors?: Array<{ reason?: unknown }> } | string };
    status?: unknown;
  };
  status?: unknown;
};

/**
 * Quota and sign-in failures hit every remaining post of the credential the
 * same way, so retrying them only burns more quota. A per-video failure such as
 * disabled comments is not one of these.
 */
function isCredentialLevelFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const failure = error as YoutubeApiErrorShape;
  const status = Number(failure.response?.status ?? failure.status ?? 0);
  if (status === 401 || status === 429) {
    return true;
  }
  const nested = failure.response?.data?.error;
  const reasons = [
    ...(failure.errors ?? []),
    ...(typeof nested === 'object' ? (nested.errors ?? []) : []),
  ].map((entry) => entry.reason);
  return (
    reasons.some(
      (reason) =>
        typeof reason === 'string' && CREDENTIAL_FAILURE_REASONS.has(reason),
    ) ||
    (typeof failure.message === 'string' &&
      failure.message.includes('invalid_grant'))
  );
}

function diagnoseYoutubePostFailure(
  error: unknown,
  secrets: readonly string[],
): Pick<YoutubeInboxPostFailure, 'errorName' | 'message'> {
  const errorName =
    error instanceof Error && error.name.trim().length > 0
      ? error.name
      : 'Error';
  let message = getErrorMessage(error);
  for (const secret of secrets) {
    const value = secret.trim();
    if (value.length < 8) {
      continue;
    }
    message = message.split(value).join(REDACTED_DIAGNOSIS);
  }
  const compact = message.replace(/\s+/g, ' ').trim();
  const hasDetail =
    compact.split(REDACTED_DIAGNOSIS).join('').trim().length > 0;
  return {
    errorName,
    message: (hasDetail ? compact : 'YouTube comment ingestion failed').slice(
      0,
      YOUTUBE_POST_FAILURE_MESSAGE_LIMIT,
    ),
  };
}

export async function ingestOwnedYoutubeComments(
  scope: SocialInboxScope,
  options: { credentialId?: string; limit?: number },
  ports: OwnedYoutubeCommentIngestPorts,
): Promise<YoutubeCommentIngestResult> {
  const limit = boundLimit(options.limit ?? 25);
  const credentials = await ports.findConnectedCredentials(
    scope,
    options.credentialId,
  );
  let messagesCreated = 0;
  let conversationsCreated = 0;
  const postFailures: YoutubeInboxPostFailure[] = [];

  for (const credential of credentials) {
    const posts = await ports.findOwnedPosts(scope.organizationId, credential);

    for (const post of posts) {
      try {
        const comments = await ports.listVideoComments(
          scope.organizationId,
          post.brandId,
          String(post.externalId),
          limit,
          credential.id,
        );

        if (comments.length === 0) {
          continue;
        }

        // Resolve which external ids already exist in one findMany pair for the
        // whole post instead of a findFirst pair per comment. The sets are
        // seeded from the DB snapshot and grown as we ingest so duplicates
        // sharing a thread within the same batch are only counted once.
        const existing = await ports.findExistingExternalIds(
          scope.organizationId,
          comments.map((comment) => comment.threadId),
          comments.map((comment) => comment.commentId),
        );

        for (const comment of comments) {
          const isNewConversation = !existing.conversationIds.has(
            comment.threadId,
          );
          const isNewMessage = !existing.messageIds.has(comment.commentId);

          await ports.ingestSyncedMessage(
            {
              ...ports.accountFields(credential),
              body: comment.text,
              brandId: post.brandId,
              conversationType: SocialConversationType.COMMENT,
              credentialId: credential.id,
              createdAt: comment.createdAt,
              externalConversationId: comment.threadId,
              externalMessageId: comment.commentId,
              externalParentId: comment.commentId,
              externalThreadId: comment.threadId,
              organizationId: scope.organizationId,
              participantAvatarUrl: comment.authorAvatarUrl,
              participantExternalId: comment.authorChannelId,
              participantHandle: comment.authorChannelUrl,
              participantName: comment.authorDisplayName,
              platform: Platform.YOUTUBE,
              postId: post.id,
              sourceContentId: String(post.externalId),
              sourceContentTitle: post.label ?? post.description.slice(0, 120),
              sourceContentType: 'video',
              sourceContentUrl:
                post.url ??
                `https://www.youtube.com/watch?v=${post.externalId}`,
            },
            existing.messagesByExternalId.get(comment.commentId),
            existing.conversationsByExternalId.get(comment.threadId),
          );

          if (isNewMessage) {
            messagesCreated++;
            existing.messageIds.add(comment.commentId);
          }
          if (isNewConversation) {
            conversationsCreated++;
            existing.conversationIds.add(comment.threadId);
          }
        }
      } catch (error: unknown) {
        const failure = diagnoseYoutubePostFailure(error, [
          scope.organizationId,
          typeof post.externalId === 'string' ? post.externalId : '',
        ]);
        postFailures.push({
          errorName: failure.errorName,
          message: failure.message,
          postId: post.id,
        });
        ports.warn('YouTube comment ingestion failed for an owned post', {
          errorName: failure.errorName,
          postFailureCount: postFailures.length,
        });
        if (isCredentialLevelFailure(error)) {
          break;
        }
      }
    }
  }

  return { conversationsCreated, messagesCreated, postFailures };
}
