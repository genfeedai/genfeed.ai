import {
  PostStatus,
  ReviewDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import PostDetailNeedsYou from '@pages/posts/detail/components/PostDetailNeedsYou';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    ({
      failedAction: 'Retry publish',
      failedDescription: 'This post failed to publish.',
      overdueAction: 'Publish now',
      overdueDescription: 'The scheduled time has passed.',
      pendingReviewAction: 'Review',
      pendingReviewDescription: 'Awaiting review before it can publish.',
      title: 'Needs you',
    })[key] ?? key,
}));

function buildPost(overrides: Partial<IPost> = {}): IPost {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    id: 'post-1',
    isDeleted: false,
    status: 'draft',
    targetExecutionState: TargetExecutionState.DRAFT,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as IPost;
}

describe('PostDetailNeedsYou', () => {
  it('renders nothing when the post needs nothing from the viewer', () => {
    const { container } = render(
      <PostDetailNeedsYou
        isPublished
        onReviewHref="/review"
        post={buildPost({
          reviewDecision: ReviewDecision.APPROVED,
          targetExecutionState: TargetExecutionState.PUBLISHED,
        })}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('surfaces a failed post with a retry action', () => {
    const onPublishNow = vi.fn();
    render(
      <PostDetailNeedsYou
        isPublished={false}
        onPublishNow={onPublishNow}
        onReviewHref="/review"
        post={buildPost({
          reviewDecision: ReviewDecision.APPROVED,
          status: PostStatus.FAILED,
          targetExecutionState: TargetExecutionState.FAILED,
        })}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Needs you' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry publish' }));
    expect(onPublishNow).toHaveBeenCalledTimes(1);
  });

  it('surfaces a post awaiting review with a link to the review queue', () => {
    render(
      <PostDetailNeedsYou
        isPublished={false}
        onReviewHref="/publishing/review"
        post={buildPost({
          reviewDecision: ReviewDecision.UNSET,
          targetExecutionState: TargetExecutionState.DRAFT,
        })}
      />,
    );

    expect(screen.getByRole('link', { name: 'Review' })).toHaveAttribute(
      'href',
      '/publishing/review',
    );
  });

  it('surfaces an overdue scheduled post', () => {
    const onPublishNow = vi.fn();
    render(
      <PostDetailNeedsYou
        isPublished={false}
        onPublishNow={onPublishNow}
        onReviewHref="/review"
        post={buildPost({
          reviewDecision: ReviewDecision.APPROVED,
          scheduledDate: '2020-01-01T00:00:00.000Z',
          targetExecutionState: TargetExecutionState.SCHEDULED,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Publish now' }));
    expect(onPublishNow).toHaveBeenCalledTimes(1);
  });
});
