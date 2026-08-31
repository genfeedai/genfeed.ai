import { BatchGenerationResultCard } from '@genfeedai/agent/components/BatchGenerationResultCard';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('BatchGenerationResultCard', () => {
  it('renders a dense metrics line without nested metric boxes', () => {
    render(
      <BatchGenerationResultCard
        action={{
          batchCount: 20,
          completedCount: 12,
          creditsUsed: 5,
          ctas: [
            {
              href: '/publishing/review?batch=batch-123&filter=ready',
              label: 'Open review queue',
            },
            { href: '/calendar/posts', label: 'Open calendar' },
          ],
          description: 'Generating drafts for Instagram, X, and LinkedIn.',
          failedCount: 1,
          id: 'batch-result-1',
          platforms: ['instagram', 'twitter', 'linkedin'],
          status: 'processing',
          title: 'Batch generation started',
          type: 'batch_generation_result_card',
        }}
      />,
    );

    expect(screen.getByText('Batch generation started')).toBeInTheDocument();
    expect(
      screen.getByText(
        '20 requested · 12 ready · 1 failed · 5 credits · Instagram · X · LinkedIn',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    // Nested metric boxes removed for T3 density.
    expect(screen.queryByText('Posts')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open review queue' }),
    ).toHaveAttribute(
      'href',
      '/publishing/review?batch=batch-123&filter=ready',
    );
    expect(screen.queryByText('batch-123')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Collapse batch result' }),
    ).toBeInTheDocument();
  });

  it('collapses previews and CTAs with a centered toggle', () => {
    render(
      <BatchGenerationResultCard
        action={{
          batchCount: 3,
          completedCount: 3,
          ctas: [
            {
              href: '/publishing/review?batch=b1&filter=ready',
              label: 'View all',
            },
          ],
          description: 'Generated 3 X drafts.',
          id: 'batch-collapse',
          items: [
            {
              id: 'post-1',
              platform: 'twitter',
              title: 'Draft one',
              type: 'post',
            },
          ],
          title: 'Batch generation complete',
          type: 'batch_generation_result_card',
        }}
      />,
    );

    expect(screen.getByText('Draft one')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse batch result' }),
    );
    expect(screen.queryByText('Draft one')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand batch result' }),
    ).toBeInTheDocument();
  });

  it('renders server-limited platform previews and a link to the rest', () => {
    render(
      <BatchGenerationResultCard
        action={{
          batchCount: 10,
          completedCount: 8,
          ctas: [
            {
              href: '/publishing/review?batch=batch-xyz&filter=ready',
              label: 'View all 8 posts',
            },
          ],
          description: 'Generated 8 X drafts.',
          id: 'batch-result-previews',
          // Server already applied takeBatchPostPreviews({ limit: 3 }).
          items: [
            {
              id: 'post-1',
              platform: 'twitter',
              title: 'First draft about image content',
              type: 'post',
            },
            {
              id: 'post-2',
              platform: 'twitter',
              title: 'Second draft with a hook',
              type: 'post',
            },
            {
              id: 'post-3',
              platform: 'twitter',
              title: 'Third draft for the feed',
              type: 'post',
            },
          ],
          remainingCount: 5,
          title: 'Batch generation complete',
          type: 'batch_generation_result_card',
        }}
      />,
    );

    // Publish-style X feed previews, not plain text rows.
    expect(screen.getAllByText('X feed preview')).toHaveLength(3);
    expect(
      screen.getByText('First draft about image content'),
    ).toBeInTheDocument();
    expect(screen.getByText('Second draft with a hook')).toBeInTheDocument();
    expect(screen.getByText('Third draft for the feed')).toBeInTheDocument();
    expect(
      screen.getAllByTestId('batch-generation-result-preview'),
    ).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: '+5 more posts in review' }),
    ).toHaveAttribute(
      'href',
      '/publishing/review?batch=batch-xyz&filter=ready',
    );
  });

  it('emphasizes all-failed batches without Ready metrics', () => {
    render(
      <BatchGenerationResultCard
        action={{
          batchCount: 20,
          completedCount: 0,
          description: 'Generated 20 X drafts.',
          failedCount: 20,
          id: 'batch-failed',
          platforms: ['twitter'],
          title: 'Batch generation complete',
          type: 'batch_generation_result_card',
        }}
      />,
    );

    expect(
      screen.getByText('20 requested · 0 ready · 20 failed · X'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('batch-generation-result').className).toMatch(
      /border-destructive/,
    );
  });
});
