import {
  CredentialPlatform,
  PostCategory,
  PostStatus,
  ReviewDecision,
} from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';
import type { PostDetailSidebarProps } from '@genfeedai/props/components/post-detail-sidebar.props';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostDetailSidebar from '@ui/posts/post-detail-sidebar/PostDetailSidebar';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@ui/tests/next-intl.stub');

  return { useTranslations: translateFromCatalog };
});

vi.mock('next/navigation', () => ({
  usePathname: () => '/posts/post-1',
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => ({ toString: () => '' }),
}));

vi.mock('@genfeedai/hooks/ui/evaluation/use-evaluation/use-evaluation', () => ({
  useEvaluation: () => ({
    evaluate: vi.fn(),
    evaluation: null,
    isEvaluating: false,
  }),
}));

vi.mock('@genfeedai/helpers/formatting/timezone/timezone.helper', () => ({
  getBrowserTimezone: () => 'UTC',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@ui/evaluation/card/EvaluationCard', () => ({
  default: () => <div data-testid="evaluation-row">Evaluation row</div>,
}));

const { tiktokState } = vi.hoisted(() => ({
  tiktokState: { isReady: false },
}));

vi.mock('@ui/posts/tiktok-publishing/TikTokPublishingSettings', () => ({
  default: function TikTokPublishingSettingsStub({
    onReadinessChange,
  }: {
    onReadinessChange?: (isReady: boolean) => void;
  }) {
    useEffect(() => {
      onReadinessChange?.(tiktokState.isReady);
    }, [onReadinessChange]);

    return <div>TikTok publishing settings</div>;
  },
}));

vi.mock('@ui/posts/youtube-publishing/YouTubePublishingSettings', () => ({
  default: function YouTubePublishingSettingsStub() {
    return <div>YouTube publishing settings</div>;
  },
}));

const baseProps: PostDetailSidebarProps = {
  analyticsStats: [],
  credential: undefined,
  isSavingSchedule: false,
  isScheduleDirty: false,
  onScheduleChange: vi.fn(),
  onScheduleSave: vi.fn(),
  post: null,
  scheduleDraft: '',
};

const seoBreakdown = {
  breakdown: {
    contentStructure: 16,
    keywordPlacement: 18,
    links: 5,
    media: 7,
    metaOptimization: 10,
    readability: 12,
    technicalSignals: 8,
  },
  checks: [],
  meta: {
    fleschReadingEase: 61,
    keywordDensity: null,
    llmApplied: false,
    maxAvailable: 100,
    scoredAt: '2026-06-28T12:00:00.000Z',
    targetKeyword: null,
    wordCount: 120,
  },
  rating: 'good',
  suggestions: ['Add a more specific title.'],
};

describe('PostDetailSidebar', () => {
  it('renders null when no post is provided', () => {
    const { container } = render(<PostDetailSidebar {...baseProps} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the destination once with handle, status, and facts', () => {
    render(
      <PostDetailSidebar
        {...baseProps}
        credential={
          { externalHandle: 'genfeed', label: 'Main account' } as never
        }
        post={
          {
            category: PostCategory.VIDEO,
            id: 'post-1',
            platform: CredentialPlatform.INSTAGRAM,
            scheduledDate: '2026-10-20T10:00:00.000Z',
            seoScore: 76,
            status: PostStatus.SCHEDULED,
            url: 'https://example.com/post',
          } as never
        }
      />,
    );

    const destination = screen.getByTestId('post-destination');
    expect(screen.getAllByText('Instagram')).toHaveLength(1);
    expect(screen.getAllByText(/@genfeed/)).toHaveLength(1);
    expect(destination).toHaveTextContent('Main account');
    expect(destination).toHaveTextContent(PostStatus.SCHEDULED);
    expect(destination).toHaveTextContent('SEO 76');
    expect(destination).toHaveTextContent('Scheduled');
    expect(
      screen.getByRole('link', { name: 'Open on platform' }),
    ).toHaveAttribute('href', 'https://example.com/post');
  });

  it('only shows Details | Preview tabs when a preview is provided', async () => {
    const user = userEvent.setup();
    const post = {
      id: 'post-1',
      platform: 'twitter',
      status: PostStatus.DRAFT,
    } as never;
    const { rerender } = render(
      <PostDetailSidebar {...baseProps} post={post} />,
    );

    expect(screen.queryByRole('tab', { name: 'Preview' })).toBeNull();

    rerender(
      <PostDetailSidebar
        {...baseProps}
        post={post}
        preview={<div>Preview body</div>}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Details' })).toBeInTheDocument();
    expect(screen.queryByText('Preview body')).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Preview' }));

    expect(screen.getByText('Preview body')).toBeVisible();
    // The details stay mounted so TikTok readiness survives the tab switch.
    expect(screen.getByTestId('post-inspector-details')).toHaveClass('hidden');
    expect(screen.getByTestId('post-when-dock')).toBeInTheDocument();
  });

  it('renders lineage and review state when review metadata is present', () => {
    render(
      <PostDetailSidebar
        {...baseProps}
        post={
          {
            id: 'post-1',
            platform: 'instagram',
            publicationDate: '2026-03-10T10:00:00.000Z',
            status: PostStatus.PUBLIC,
            url: 'https://example.com/post',
          } as never
        }
        reviewSummary={{
          generationId: 'gen-123',
          promptUsed: 'Write a launch clip',
          reviewTurboRunId: 'batch-1',
          reviewDecision: ReviewDecision.REQUEST_CHANGES,
          reviewEvents: [
            {
              decision: 'request_changes',
              feedback: 'Needs a stronger hook.',
              reviewedAt: '2026-03-10T12:00:00.000Z',
            },
          ],
          reviewedAt: '2026-03-10T12:00:00.000Z',
          reviewFeedback: 'Needs a stronger hook.',
          reviewItemId: 'item-1',
          sourceActionId: 'action-1',
          sourceWorkflowName: 'Clip Workflow',
        }}
      />,
    );

    // Lineage is collapsed by default; its summary shows the decision.
    expect(screen.queryByText('Clip Workflow')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Lineage/ }));

    expect(screen.getByText('Clip Workflow')).toBeInTheDocument();
    expect(screen.getByText('gen-123')).toBeInTheDocument();
    expect(screen.getByText('Write a launch clip')).toBeInTheDocument();
    expect(screen.getByText('Review State')).toBeInTheDocument();
    // Section summary + decision row + review event.
    expect(screen.getAllByText('Changes requested')).toHaveLength(3);
    expect(screen.getAllByText('Needs a stronger hook.')).toHaveLength(2);
  });

  it('renders the SEO row and forwards the score action', () => {
    const onScoreSeo = vi.fn();

    render(
      <PostDetailSidebar
        {...baseProps}
        post={
          {
            id: 'post-1',
            platform: 'twitter',
            seoBreakdown,
            seoScore: 76,
            status: PostStatus.DRAFT,
          } as never
        }
        onScoreSeo={onScoreSeo}
      />,
    );

    expect(screen.getByText('SEO score')).toBeInTheDocument();
    expect(screen.getByText('76')).toBeInTheDocument();
    expect(
      screen.queryByText('Add a more specific title.'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle SEO details' }));
    expect(screen.getByText('Add a more specific title.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Re-score SEO' }));

    expect(onScoreSeo).toHaveBeenCalledTimes(1);
  });

  it('collapses and expands a section from its header', () => {
    render(
      <PostDetailSidebar
        {...baseProps}
        post={
          {
            id: 'post-1',
            platform: 'twitter',
            status: PostStatus.DRAFT,
          } as never
        }
      />,
    );

    expect(screen.getByTestId('evaluation-row')).toBeInTheDocument();

    const header = screen.getByRole('button', { name: /^Checks/ });
    expect(header).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(header);

    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('evaluation-row')).not.toBeInTheDocument();

    fireEvent.click(header);

    expect(screen.getByTestId('evaluation-row')).toBeInTheDocument();
  });

  it('disables publishing until TikTok settings report ready', () => {
    tiktokState.isReady = false;
    const onTikTokReadinessChange = vi.fn();
    const post = {
      category: PostCategory.VIDEO,
      id: 'post-1',
      ingredients: [{ id: 'video-1' }],
      platform: CredentialPlatform.TIKTOK,
      status: PostStatus.DRAFT,
    } as never;
    const { unmount } = render(
      <PostDetailSidebar
        {...baseProps}
        post={post}
        onPublishNow={vi.fn()}
        onTikTokReadinessChange={onTikTokReadinessChange}
      />,
    );

    expect(screen.getByText('TikTok publishing settings')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish now' })).toBeDisabled();
    expect(screen.getByTestId('post-when-readiness')).toHaveTextContent(
      'Finish TikTok settings',
    );
    expect(onTikTokReadinessChange).toHaveBeenLastCalledWith(false);
    unmount();

    tiktokState.isReady = true;
    render(
      <PostDetailSidebar
        {...baseProps}
        post={post}
        onPublishNow={vi.fn()}
        onTikTokReadinessChange={onTikTokReadinessChange}
      />,
    );

    expect(screen.getByRole('button', { name: 'Publish now' })).toBeEnabled();
    expect(screen.getByTestId('post-when-readiness')).toHaveTextContent(
      'Ready',
    );
    expect(onTikTokReadinessChange).toHaveBeenLastCalledWith(true);
  });

  it('shows YouTube settings for unpublished YouTube posts only', () => {
    function buildPost(platform: CredentialPlatform): IPost {
      return {
        category: PostCategory.VIDEO,
        id: 'post-1',
        ingredients: [{ id: 'video-1' }],
        platform,
        status: PostStatus.DRAFT,
      } as unknown as IPost;
    }
    const { unmount } = render(
      <PostDetailSidebar
        {...baseProps}
        post={buildPost(CredentialPlatform.YOUTUBE)}
        onPublishNow={vi.fn()}
      />,
    );

    expect(screen.getByTestId('inspector-youtube')).toBeInTheDocument();
    expect(screen.getByText('YouTube publishing settings')).toBeVisible();
    unmount();

    render(
      <PostDetailSidebar
        {...baseProps}
        post={buildPost(CredentialPlatform.TWITTER)}
        onPublishNow={vi.fn()}
      />,
    );

    expect(
      screen.queryByText('YouTube publishing settings'),
    ).not.toBeInTheDocument();
  });

  it('shows the published state with a view link and no publish button', () => {
    render(
      <PostDetailSidebar
        {...baseProps}
        onPublishNow={vi.fn()}
        post={
          {
            id: 'post-1',
            platform: 'instagram',
            publicationDate: '2026-03-10T10:00:00.000Z',
            status: PostStatus.PUBLIC,
            url: 'https://example.com/post',
          } as never
        }
      />,
    );

    expect(
      screen.getByRole('link', { name: 'View on Instagram' }),
    ).toHaveAttribute('href', 'https://example.com/post');
    expect(
      screen.queryByRole('button', { name: 'Publish now' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('TikTok publishing settings'),
    ).not.toBeInTheDocument();
  });

  it('only offers the TikTok app publishing handoff for TikTok videos', () => {
    const onPublishViaTikTokApp = vi.fn();
    const { rerender } = render(
      <PostDetailSidebar
        {...baseProps}
        post={
          {
            category: PostCategory.VIDEO,
            id: 'post-1',
            ingredients: [{ id: 'video-1' }],
            platform: CredentialPlatform.TIKTOK,
            status: PostStatus.DRAFT,
          } as never
        }
        onPublishNow={vi.fn()}
        onPublishViaTikTokApp={onPublishViaTikTokApp}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'More TikTok publishing options',
      }),
    ).toBeVisible();

    rerender(
      <PostDetailSidebar
        {...baseProps}
        post={
          {
            category: PostCategory.IMAGE,
            id: 'post-2',
            ingredients: [{ id: 'image-1' }],
            platform: CredentialPlatform.TIKTOK,
            status: PostStatus.DRAFT,
          } as never
        }
        onPublishNow={vi.fn()}
        onPublishViaTikTokApp={onPublishViaTikTokApp}
      />,
    );

    expect(
      screen.queryByRole('button', {
        name: 'More TikTok publishing options',
      }),
    ).not.toBeInTheDocument();
  });
});
