import { isTwitterPlatform } from '@genfeedai/contracts';
import { HttpException, HttpStatus } from '@nestjs/common';

export function isAccountThreadFormat(format: string | undefined): boolean {
  return format === 'thread';
}

export function invalidThreadCountMessage(
  count: number,
): { detail: string; title: string } | undefined {
  if (count < 2) {
    return {
      detail: 'Thread generation requires at least two posts',
      title: 'Invalid thread count',
    };
  }

  if (count > 25) {
    return {
      detail: 'Thread generation supports at most 25 posts',
      title: 'Invalid thread count',
    };
  }

  return undefined;
}

export function createPostsGenerationHttpException(
  detail: string,
  title: string,
  status: HttpStatus,
): HttpException {
  return new HttpException({ detail, title }, status);
}

export function isOwnedPost(
  post: { organizationId?: string } | null,
  organizationId: string,
): boolean {
  return Boolean(post && post.organizationId === organizationId);
}

export { isTwitterPlatform };

const THREAD_EXPANSION_REASONS = {
  alreadyThread: {
    detail: 'This post already has thread children. Cannot expand further.',
    status: HttpStatus.BAD_REQUEST,
    title: 'Already a thread',
  },
  forbidden: {
    detail: 'You do not have access to this post',
    status: HttpStatus.FORBIDDEN,
    title: 'Access denied',
  },
  missing: {
    detail: 'The specified post does not exist',
    status: HttpStatus.NOT_FOUND,
    title: 'Post not found',
  },
  platform: {
    detail: 'Thread expansion is only available for Twitter/X posts',
    status: HttpStatus.BAD_REQUEST,
    title: 'Platform not supported',
  },
} as const;

export function threadExpansionBlockReason(input: {
  existingChildren: number;
  isOwned: boolean;
  isTwitter: boolean;
  postExists: boolean;
}): { detail: string; status: HttpStatus; title: string } | undefined {
  const checks: Array<
    [boolean, { detail: string; status: HttpStatus; title: string }]
  > = [
    [!input.postExists, THREAD_EXPANSION_REASONS.missing],
    [!input.isOwned, THREAD_EXPANSION_REASONS.forbidden],
    [input.existingChildren > 0, THREAD_EXPANSION_REASONS.alreadyThread],
    [!input.isTwitter, THREAD_EXPANSION_REASONS.platform],
  ];

  return checks.find(([failed]) => failed)?.[1];
}

export function postAccessBlockReason(
  post: { organizationId?: string } | null,
  organizationId: string,
  postId: string,
): { detail: string; status: HttpStatus; title: string } | undefined {
  if (!post) {
    return {
      detail: 'Post not found',
      status: HttpStatus.NOT_FOUND,
      title: `Post ${postId} not found`,
    };
  }

  if (post.organizationId !== organizationId) {
    return {
      detail: 'You do not have access to this post',
      status: HttpStatus.FORBIDDEN,
      title: 'Access denied',
    };
  }

  return undefined;
}

export function generationFailureMessage(
  error: unknown,
  fallback: string,
): string {
  const message = (error as Error)?.message;
  return message || fallback;
}
