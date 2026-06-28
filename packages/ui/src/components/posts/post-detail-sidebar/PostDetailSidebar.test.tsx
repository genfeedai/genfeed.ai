import { PostStatus } from '@genfeedai/enums';
import type { PostDetailSidebarProps } from '@genfeedai/props/components/post-detail-sidebar.props';
import { fireEvent, render, screen } from '@testing-library/react';
import PostDetailSidebar from '@ui/posts/post-detail-sidebar/PostDetailSidebar';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

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
  default: () => <div>Evaluation Card</div>,
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

describe('PostDetailSidebar', () => {
  it('renders null when no post is provided', () => {
    const { container } = render(<PostDetailSidebar {...baseProps} />);
    expect(container.firstChild).toBeNull();
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
          reviewBatchId: 'batch-1',
          reviewDecision: 'request_changes',
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

    expect(screen.getByText('Lineage')).toBeInTheDocument();
    expect(screen.getByText('Clip Workflow')).toBeInTheDocument();
    expect(screen.getByText('gen-123')).toBeInTheDocument();
    expect(screen.getByText('Write a launch clip')).toBeInTheDocument();
    expect(screen.getByText('Review State')).toBeInTheDocument();
    expect(screen.getAllByText('Changes requested')).toHaveLength(2);
    expect(screen.getAllByText('Needs a stronger hook.')).toHaveLength(2);
  });

  it('renders SEO scorecard and forwards score action', () => {
    const onScoreSeo = vi.fn();

    render(
      <PostDetailSidebar
        {...baseProps}
        post={
          {
            id: 'post-1',
            platform: 'twitter',
            seoBreakdown: {
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
            },
            seoScore: 76,
            status: PostStatus.DRAFT,
          } as never
        }
        onScoreSeo={onScoreSeo}
      />,
    );

    expect(screen.getByText('SEO Scorecard')).toBeInTheDocument();
    expect(screen.getByText('76')).toBeInTheDocument();
    expect(screen.getByText('Add a more specific title.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Re-score SEO' }));

    expect(onScoreSeo).toHaveBeenCalledTimes(1);
  });
});
