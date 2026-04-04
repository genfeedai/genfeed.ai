import { BatchGenerationResultCard } from '@cloud/agent/components/BatchGenerationResultCard';
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
              href: '/posts/review?batch=batch-123&filter=ready',
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
    ).toHaveAttribute('href', '/posts/review?batch=batch-123&filter=ready');
    expect(screen.queryByText('batch-123')).not.toBeInTheDocument();
  });
});
