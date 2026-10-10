import { TurboRunResultCard } from '@genfeedai/agent/components/TurboRunResultCard';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    organizationId: 'org-1',
    credentials: [],
    selectedBrand: { id: 'brand-1', organizationId: 'org-1', label: 'Genfeed' },
  }),
}));

describe('TurboRunResultCard', () => {
  it('renders a dense metrics line without nested metric boxes', () => {
    render(
      <TurboRunResultCard
        action={{
          turboRunCount: 20,
          completedCount: 12,
          creditsUsed: 5,
          ctas: [
            {
              href: '/publishing/review?run=run-123&filter=ready',
              label: 'Open review queue',
            },
            { href: '/calendar/posts', label: 'Open calendar' },
          ],
          description: 'Generating drafts for Instagram, X, and LinkedIn.',
          failedCount: 1,
          id: 'run-result-1',
          platforms: ['instagram', 'twitter', 'linkedin'],
          status: 'processing',
          title: 'Turbo run started',
          type: 'turbo_run_result_card',
        }}
      />,
    );

    expect(screen.getByText('Turbo run started')).toBeInTheDocument();
    expect(
      screen.getByText(
        '20 requested · 12 ready · 1 failed · 5 credits · Instagram · X · LinkedIn',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Creating posts');
    expect(screen.getByText('12 of 20 ready')).toBeInTheDocument();
    // Nested metric boxes removed for T3 density.
    expect(screen.queryByText('Posts')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open review queue' }),
    ).toHaveAttribute('href', '/publishing/review?run=run-123&filter=ready');
    expect(screen.queryByText('run-123')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Collapse run result' }),
    ).toBeInTheDocument();
  });

  it('collapses previews and CTAs with a centered toggle', () => {
    render(
      <TurboRunResultCard
        action={{
          turboRunCount: 3,
          completedCount: 3,
          ctas: [
            {
              href: '/publishing/review?run=b1&filter=ready',
              label: 'View all',
            },
          ],
          description: 'Generated 3 X drafts.',
          id: 'run-collapse',
          items: [
            {
              id: 'post-1',
              platform: 'twitter',
              title: 'Draft one',
              type: 'post',
            },
          ],
          title: 'Turbo run complete',
          type: 'turbo_run_result_card',
        }}
      />,
    );

    expect(screen.getByText('Draft one')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Collapse run result' }),
    );
    expect(screen.queryByText('Draft one')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Expand run result' }),
    ).toBeInTheDocument();
  });

  it('renders server-limited platform previews and a link to the rest', () => {
    render(
      <TurboRunResultCard
        action={{
          turboRunCount: 10,
          completedCount: 8,
          ctas: [
            {
              href: '/publishing/review?run=run-xyz&filter=ready',
              label: 'View all 8 posts',
            },
          ],
          description: 'Generated 8 X drafts.',
          id: 'run-result-previews',
          // Server already applied takeTurboRunPostPreviews({ limit: 3 }).
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
          title: 'Turbo run complete',
          type: 'turbo_run_result_card',
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
    expect(screen.getAllByTestId('turbo-run-result-preview')).toHaveLength(3);
    expect(
      screen.getByRole('link', { name: '+5 more posts in review' }),
    ).toHaveAttribute('href', '/publishing/review?run=run-xyz&filter=ready');
  });

  it('emphasizes all-failed runs without Ready metrics', () => {
    render(
      <TurboRunResultCard
        action={{
          turboRunCount: 20,
          completedCount: 0,
          description: 'Generated 20 X drafts.',
          failedCount: 20,
          id: 'run-failed',
          platforms: ['twitter'],
          title: 'Turbo run complete',
          type: 'turbo_run_result_card',
        }}
      />,
    );

    expect(
      screen.getByText('20 requested · 0 ready · 20 failed · X'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('turbo-run-result').className).toMatch(
      /border-destructive/,
    );
  });
});
