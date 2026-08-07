import { BatchGenerationResultCard } from '@genfeedai/agent/components/BatchGenerationResultCard';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('BatchGenerationResultCard', () => {
  it('renders status and credit badges without exposing the batch id', () => {
    render(
      <BatchGenerationResultCard
        action={{
          batchCount: 20,
          completedCount: 12,
          creditsUsed: 5,
          ctas: [
            {
              href: '/publish/review?batch=batch-123&filter=ready',
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
    expect(screen.getByText('5 credits')).toBeInTheDocument();
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByText('Posts')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Instagram')).toBeInTheDocument();
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open review queue' }),
    ).toHaveAttribute('href', '/publish/review?batch=batch-123&filter=ready');
    expect(screen.queryByText('batch-123')).not.toBeInTheDocument();
  });

  it('renders server-limited preview items and a link to the rest', () => {
    render(
      <BatchGenerationResultCard
        action={{
          batchCount: 10,
          completedCount: 8,
          ctas: [
            {
              href: '/publish/review?batch=batch-xyz&filter=ready',
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

    expect(screen.getByText('Draft previews')).toBeInTheDocument();
    expect(
      screen.getByText('First draft about image content'),
    ).toBeInTheDocument();
    expect(screen.getByText('Second draft with a hook')).toBeInTheDocument();
    expect(screen.getByText('Third draft for the feed')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '+5 more posts in review' }),
    ).toHaveAttribute('href', '/publish/review?batch=batch-xyz&filter=ready');
  });
});
