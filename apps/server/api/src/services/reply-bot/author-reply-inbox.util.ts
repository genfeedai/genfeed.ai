import type { AuthorReplyLoopService } from '@api/services/reply-bot/author-reply-loop.service';
import type {
  AuthorReplyInboxItem,
  AuthorReplyInboxResult,
} from '@api/services/reply-bot/author-reply-loop.types';
import {
  clampReplyMaxAgeHours,
  getReplyIntentPersona,
  resolveReplyIntent,
} from '@api/services/reply-bot/reply-intent.util';
import type {
  SocialContentData,
  SocialMonitorService,
} from '@api/services/reply-bot/social-monitor.service';
import {
  toYouTubeChannelStartUrl,
  toYouTubeVideoUrl,
} from '@api/services/reply-bot/youtube-reply-url.util';
import { ReplyBotPlatform } from '@genfeedai/contracts';
import type { IReplyBotCredentialData } from '@genfeedai/contracts/interfaces';
import type { LoggerService } from '@libs/logger/logger.service';

const MAX_PARENT_POSTS = 12;
const MAX_COMMENTS_PER_POST = 40;

export type AuthorReplyInboxPorts = {
  constructorName: string;
  loadCredential: (
    organizationId: string,
    brandId: string,
    platform: ReplyBotPlatform,
  ) => Promise<IReplyBotCredentialData | null>;
  loadProcessedCommentIds: (organizationId: string) => Promise<Set<string>>;
  logger: Pick<LoggerService, 'warn'>;
  socialMonitorService: Pick<
    SocialMonitorService,
    'getUserTimeline' | 'getContentComments'
  >;
};

export async function collectAuthorReplyInbox(
  params: Parameters<AuthorReplyLoopService['getInbox']>[0],
  ports: AuthorReplyInboxPorts,
): Promise<AuthorReplyInboxResult> {
  const replyPlatform =
    params.platform === 'youtube'
      ? ReplyBotPlatform.YOUTUBE
      : ReplyBotPlatform.TWITTER;
  const hours =
    params.platform === 'youtube'
      ? clampReplyMaxAgeHours(params.hours ?? 48)
      : clampReplyMaxAgeHours(params.hours);
  const emptyInbox = (): AuthorReplyInboxResult => ({
    hours,
    items: [],
    platform: replyPlatform,
  });

  const credential = await ports.loadCredential(
    params.organizationId,
    params.brandId,
    replyPlatform,
  );

  if (!credential) {
    return emptyInbox();
  }

  const timelineTarget = authorReplyTimelineTarget(credential, replyPlatform);
  if (!timelineTarget) {
    return emptyInbox();
  }

  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  const ourUsername = (credential.username || credential.externalId || '')
    .replace(/^@/, '')
    .toLowerCase();

  let posts: SocialContentData[] = [];
  try {
    posts = await ports.socialMonitorService.getUserTimeline(
      replyPlatform,
      timelineTarget,
      {
        brandId: params.brandId,
        limit: MAX_PARENT_POSTS,
        organizationId: params.organizationId,
        preferOfficialApi: true,
      },
    );
  } catch (error: unknown) {
    ports.logger.warn(`${ports.constructorName} timeline fetch failed`, {
      error: error instanceof Error ? error.message : 'unknown',
      platform: replyPlatform,
    });
    // Handled empty: return empty inbox rather than crashing the Replies UI.
    return {
      hours,
      items: [],
      platform: replyPlatform,
      username: credential.username || credential.externalId || undefined,
    };
  }

  const items: AuthorReplyInboxItem[] = [];
  const processedIds = await ports.loadProcessedCommentIds(
    params.organizationId,
  );

  for (const post of posts) {
    // Parent posts older than the window are out of scope for fresh replies.
    if (post.createdAt && post.createdAt.getTime() < cutoff) {
      continue;
    }

    const commentTarget =
      replyPlatform === ReplyBotPlatform.YOUTUBE
        ? toYouTubeVideoUrl({
            contentUrl: post.contentUrl,
            id: post.id,
          })
        : post.id;

    let comments: SocialContentData[] = [];
    try {
      comments = await ports.socialMonitorService.getContentComments(
        replyPlatform,
        commentTarget,
        {
          brandId: params.brandId,
          limit: MAX_COMMENTS_PER_POST,
          organizationId: params.organizationId,
          preferOfficialApi: true,
        },
      );
    } catch (error: unknown) {
      ports.logger.warn(`${ports.constructorName} comment fetch failed`, {
        error: error instanceof Error ? error.message : 'unknown',
        platform: replyPlatform,
        postId: post.id,
      });
      continue;
    }

    items.push(
      ...mapAuthorReplyComments(
        comments,
        post,
        cutoff,
        ourUsername,
        processedIds,
      ),
    );
  }

  items.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return {
    hours,
    items: items.slice(0, 50),
    platform: replyPlatform,
    username: credential.username || credential.externalId || undefined,
  };
}

function mapAuthorReplyComments(
  comments: SocialContentData[],
  post: SocialContentData,
  cutoff: number,
  ourUsername: string,
  processedIds: Set<string>,
): AuthorReplyInboxItem[] {
  const items: AuthorReplyInboxItem[] = [];
  for (const comment of comments) {
    if (processedIds.has(comment.id)) {
      continue;
    }
    if (comment.createdAt && comment.createdAt.getTime() < cutoff) {
      continue;
    }
    const author = comment.authorUsername.replace(/^@/, '').toLowerCase();
    if (ourUsername && author === ourUsername) {
      continue;
    }

    // The inbox lists up to MAX_PARENT_POSTS x MAX_COMMENTS_PER_POST
    // comments per load; one provider call each would be hundreds of
    // decisions for a listing nobody acts on yet. The gated decision runs
    // where an auto-reply is actually sent, and on draft/send below.
    const intent = resolveReplyIntent(comment.text);
    const persona = getReplyIntentPersona(intent);

    items.push({
      authorDisplayName: comment.authorDisplayName,
      authorId: comment.authorId,
      authorUsername: comment.authorUsername,
      commentId: comment.id,
      commentText: comment.text,
      commentUrl: comment.contentUrl,
      createdAt: comment.createdAt.toISOString(),
      intent,
      intentLabel: persona.label,
      parentPostId: post.id,
      parentPostPreview: post.text?.slice(0, 160),
      parentPostUrl: post.contentUrl,
      shouldSkipAuto: persona.shouldSkipAuto,
    });
  }
  return items;
}

function authorReplyTimelineTarget(
  credential: IReplyBotCredentialData,
  replyPlatform: ReplyBotPlatform,
): string {
  const timelineHandle =
    credential.username ||
    credential.externalId ||
    (replyPlatform === ReplyBotPlatform.YOUTUBE ? 'me' : '');

  if (!timelineHandle && replyPlatform === ReplyBotPlatform.TWITTER) {
    return '';
  }

  // YouTube Apify handlers expect full channel/video URLs, not bare ids.
  const timelineTarget =
    replyPlatform === ReplyBotPlatform.YOUTUBE
      ? toYouTubeChannelStartUrl(timelineHandle)
      : timelineHandle || 'me';

  return timelineTarget;
}
